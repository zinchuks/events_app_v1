-- S6 source registry, leases/backoff, atomic normalized updates and source-native translations.
-- No AI calls/billing, automatic dedup merge, cron or delivery activation here.
alter table public.sources add column code text unique;
alter table public.sources add column freshness_seconds integer not null default 172800 check(freshness_seconds>0);
alter table public.sources add column coverage_note text;
alter table public.source_records add column series_key text;
alter table public.translations add column summary text;

update public.sources set code='madrid',coverage_note='Single-day, non-recurring municipal activities; not the whole city agenda.'
where id=(select id from public.sources where url='https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information' and not is_demo order by id limit 1);
insert into public.sources(code,name,url,acquisition,terms_status,rights_reference,allow_cache,allow_translate,allow_images,poll_interval_seconds,freshness_seconds,coverage_note)
values
 ('madrid','Ayuntamiento de Madrid · CC BY 4.0','https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information','api','allowed','https://datos.madrid.es/pages/condiciones-de-uso',true,true,false,86400,172800,'Single-day, non-recurring municipal activities; not the whole city agenda.'),
 ('toronto','Contains information licensed under the Open Government Licence – Toronto.','https://open.toronto.ca/dataset/festivals-events/','api','allowed','https://open.toronto.ca/open-data-licence/',true,true,false,86400,172800,'Bounded prefix: 32 MiB / 5000 inspected rows / 400 imported sessions; next 60 days, one venue. Not the full calendar.'),
 ('helsinki','City of Helsinki · Linked Events · CC BY 4.0','https://api.hel.fi/linkedevents/v1/','api','allowed','https://creativecommons.org/licenses/by/4.0/',true,true,false,21600,43200,'Latest-modified subset: up to 3 pages × 100 records, next 60 days, Helsinki municipality, individual sessions only.')
on conflict(code) do nothing;
insert into public.territories(country_code,external_id,kind,parent_id,names,provenance)
select 'FI','catalog:city:FI:Helsinki','city',id,'{"en":"Helsinki","uk":"Гельсінкі","es":"Helsinki"}'::jsonb,
 'Curated city label; event territory requires provider ocd municipality division; no city geometry inferred.'
from public.territories where external_id='iso3166:FI'
on conflict(external_id) do nothing;

create table public.source_poll_state (
 source_id uuid primary key references public.sources(id),
 token uuid, lease_until timestamptz, next_poll_at timestamptz not null default now(),
 failures integer not null default 0 check(failures between 0 and 30),
 last_error_code text check(last_error_code in ('fetch_failed','normalize_failed','import_failed','lease_expired'))
);
create table public.duplicate_candidates (
 left_occurrence uuid not null references public.occurrences(id) on delete cascade,
 right_occurrence uuid not null references public.occurrences(id) on delete cascade,
 reason text not null default 'exact_title_venue_time_country_nearby',
 status text not null default 'pending' check(status in ('pending','distinct','duplicate')),
 created_at timestamptz not null default now(),
 primary key(left_occurrence,right_occurrence), check(left_occurrence<right_occurrence)
);
alter table public.source_poll_state enable row level security;
alter table public.duplicate_candidates enable row level security;
revoke all on public.source_poll_state,public.duplicate_candidates from anon,authenticated;
grant all on public.source_poll_state,public.duplicate_candidates to service_role;

create function public.claim_s6_source(source_code text, force_poll boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare source uuid; claim uuid:=gen_random_uuid(); state public.source_poll_state;
begin
 select id into source from public.sources where code=source_code and code in ('madrid','toronto','helsinki')
  and terms_status='allowed' and allow_cache and not is_demo;
 if source is null or force_poll is null then raise exception 'Unapproved source'; end if;
 insert into public.source_poll_state(source_id) values(source) on conflict do nothing;
 select * into state from public.source_poll_state where source_id=source for update;
 if state.lease_until>now() or (not force_poll and state.next_poll_at>now()) then return null; end if;
 update public.source_poll_state set token=claim,lease_until=now()+interval '4 minutes' where source_id=source;
 return claim;
end $$;
create function public.fail_s6_source(source_code text, claim_token uuid, error_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if error_code is null or error_code not in ('fetch_failed','normalize_failed','import_failed','lease_expired') then raise exception 'Invalid diagnostic'; end if;
 update public.source_poll_state p set token=null,lease_until=null,failures=least(30,failures+1),last_error_code=error_code,
  next_poll_at=now()+make_interval(secs=>least(86400,300*power(2,least(failures,9)))::integer)
 from public.sources s where s.id=p.source_id and s.code=source_code and p.token=claim_token;
 -- Never mark the source healthy on failure; no raw HTTP body/keys in diagnostics.
end $$;

create function public.ingest_s6_source(source_code text,batch jsonb,fetched_at timestamptz,claim_token uuid,metrics jsonb) returns integer
language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare source public.sources; r jsonb; o jsonb; tr jsonb; record uuid; event uuid; occurrence uuid;
 old_hash text; changed boolean; imported integer:=0; territory uuid; position extensions.geography;
 event_version integer; expected_timezone text; permitted_url text;
begin
 if source_code is null or source_code not in ('madrid','toronto','helsinki') or claim_token is null
  or jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch) not between 1 and 2000
  or fetched_at is null or fetched_at>now()+interval '5 minutes' or fetched_at<now()-interval '15 minutes'
  or jsonb_typeof(metrics) is distinct from 'object' or length(metrics::text)>2000
 then raise exception 'Invalid import' using errcode='22023'; end if;
 select * into source from public.sources where code=source_code and terms_status='allowed' and allow_cache and not is_demo;
 if source.id is null then raise exception 'Unapproved source'; end if;
 perform 1 from public.source_poll_state where source_id=source.id and token=claim_token and lease_until>now() for update;
 if not found then raise exception 'Invalid or expired source lease'; end if;
 -- Serialize with the legacy Madrid importer too; preserve saved/digest occurrence IDs.
 perform pg_advisory_xact_lock(hashtextextended(source.url,0));
 expected_timezone:=case source_code when 'madrid' then 'Europe/Madrid' when 'toronto' then 'America/Toronto' else 'Europe/Helsinki' end;
 permitted_url:=case source_code when 'madrid' then '^https?://(www\.)?madrid\.es/'
  when 'toronto' then '^https://open\.toronto\.ca/dataset/festivals-events/$'
  else '^https://api\.hel\.fi/linkedevents/v1/event/[a-zA-Z0-9:%_.-]+/$' end;
 if (select count(distinct value->>'external_id') from jsonb_array_elements(batch))<>jsonb_array_length(batch) then raise exception 'Duplicate identity'; end if;
 for r in select value from jsonb_array_elements(batch) loop
  if jsonb_typeof(r) is distinct from 'object' or coalesce(length(r->>'external_id'),0) not between 1 and 500
   or r->>'hash' is null or r->>'hash' !~ '^[a-f0-9]{64}$' or coalesce(length(trim(r->>'title')),0) not between 1 and 400
   or coalesce(length(r->>'description'),0)>20000 or coalesce(length(r->>'venue'),0)>400
   or r->>'url' is null or r->>'url' !~ permitted_url or length(r->>'url')>3000
   or jsonb_typeof(r->'occurrences') is distinct from 'array' or jsonb_array_length(r->'occurrences')<>1
   or (r->>'price' is null)<>(r->>'currency' is null) or (r->>'price')::numeric<0
   or (r->>'currency' is not null and r->>'currency'<>case source_code when 'toronto' then 'CAD' else 'EUR' end)
  then raise exception 'Invalid normalized record' using errcode='22023'; end if;
  o:=r->'occurrences'->0;
  if o->>'external_id' is distinct from r->>'external_id' or o->>'timezone' is distinct from expected_timezone then raise exception 'Invalid session identity'; end if;
  territory:=null; position:=null;
  if r->>'territory' is not null then
   select id into territory from public.territories where external_id=r->>'territory' and not is_demo
    and country_code=case source_code when 'madrid' then 'ES' when 'toronto' then 'CA' else 'FI' end;
   if territory is null then raise exception 'Invalid territory'; end if;
  end if;
  if r->'location' is not null and r->'location'<>'null'::jsonb then
   if jsonb_typeof(r->'location')<>'array' or jsonb_array_length(r->'location')<>2
    or jsonb_typeof(r->'location'->0)<>'number' or jsonb_typeof(r->'location'->1)<>'number'
    or (r->'location'->>0)::numeric not between -180 and 180 or (r->'location'->>1)::numeric not between -90 and 90
   then raise exception 'Invalid WGS84 point'; end if;
   position:=extensions.st_setsrid(extensions.st_makepoint((r->'location'->>0)::float8,(r->'location'->>1)::float8),4326)::extensions.geography;
  end if;
  select id,payload_hash into record,old_hash from public.source_records where source_id=source.id and external_id=r->>'external_id';
  changed:=old_hash is distinct from r->>'hash';
  insert into public.source_records(source_id,external_id,payload_hash,fetched_at,canonical_url,series_key)
  values(source.id,r->>'external_id',r->>'hash',fetched_at,r->>'url',r->>'series_key')
  on conflict(source_id,external_id) do update set payload_hash=excluded.payload_hash,fetched_at=excluded.fetched_at,canonical_url=excluded.canonical_url,series_key=excluded.series_key
  returning id into record;
  select oc.event_id into event from public.event_sources es join public.occurrences oc on oc.id=es.occurrence_id where es.source_record_id=record order by oc.id limit 1;
  event:=coalesce(event,md5(source.id::text||':'||(r->>'external_id'))::uuid);
  -- Defend versioning even if a buggy caller supplies an unchanged hash for changed facts.
  changed:=changed or exists(select 1 from public.events e where id=event and
   (e.title is distinct from r->>'title' or e.description is distinct from r->>'description' or e.venue is distinct from r->>'venue'
    or e.category_code is distinct from r->>'category_code' or e.territory_id is distinct from territory
    or e.price is distinct from (r->>'price')::numeric or e.currency is distinct from r->>'currency'
    or e.original_language is distinct from r->>'original_language'
    or e.location::text is distinct from position::text));
  changed:=changed or exists(select 1 from public.occurrences oc where event_id=event and external_id=o->>'external_id' and
   (oc.time_kind is distinct from o->>'time_kind' or oc.start_at is distinct from (o->>'start_at')::timestamptz
    or oc.end_at is distinct from (o->>'end_at')::timestamptz or oc.local_date is distinct from (o->>'local_date')::date
    or oc.timezone is distinct from expected_timezone));
  insert into public.events(id,primary_source_id,canonical_url,checked_at,title,description,venue,category_code,territory_id,location,price,currency,original_language,is_demo)
  values(event,source.id,r->>'url',fetched_at,r->>'title',r->>'description',r->>'venue',r->>'category_code',territory,position,(r->>'price')::numeric,r->>'currency',r->>'original_language',false)
  on conflict(id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at,title=excluded.title,description=excluded.description,
   venue=excluded.venue,category_code=excluded.category_code,territory_id=excluded.territory_id,location=excluded.location,price=excluded.price,currency=excluded.currency,
   original_language=excluded.original_language,version=public.events.version+case when changed then 1 else 0 end
  returning version into event_version;
  insert into public.occurrences(event_id,external_id,time_kind,start_at,end_at,local_date,timezone)
  values(event,o->>'external_id',o->>'time_kind',(o->>'start_at')::timestamptz,(o->>'end_at')::timestamptz,(o->>'local_date')::date,expected_timezone)
  on conflict(event_id,external_id) do update set time_kind=excluded.time_kind,start_at=excluded.start_at,end_at=excluded.end_at,local_date=excluded.local_date,timezone=excluded.timezone
  returning id into occurrence;
  insert into public.event_sources(occurrence_id,source_record_id,canonical_url,checked_at) values(occurrence,record,r->>'url',fetched_at)
  on conflict(occurrence_id,source_record_id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at;
  if r->'translations' is not null then
   if not source.allow_translate or jsonb_typeof(r->'translations')<>'array' or jsonb_array_length(r->'translations')>3 then raise exception 'Invalid translations'; end if;
   for tr in select value from jsonb_array_elements(r->'translations') loop
    if tr->>'locale' is null or tr->>'locale' not in ('uk','en','es') or coalesce(length(trim(tr->>'title')),0) not between 1 and 400
     or coalesce(length(tr->>'description'),0) not between 1 and 20000 or coalesce(length(tr->>'summary'),0)>600 then raise exception 'Invalid translation'; end if;
    insert into public.translations(event_id,version,locale,provider,status,title,description,summary)
    values(event,event_version,tr->>'locale','source:'||source_code,'ready',tr->>'title',tr->>'description',tr->>'summary')
    on conflict(event_id,version,locale,provider) do update set title=excluded.title,description=excluded.description,summary=excluded.summary,status='ready';
   end loop;
  end if;
  imported:=imported+1;
 end loop;
 -- Conservative candidates only; each source ID/session remains independent. No automatic merge.
 insert into public.duplicate_candidates(left_occurrence,right_occurrence)
 select a.id,b.id from public.occurrences a join public.events ea on ea.id=a.event_id
 join public.occurrences b on a.id<b.id and a.time_kind='known' and b.time_kind='known' and a.start_at=b.start_at
 join public.events eb on eb.id=b.event_id
 join public.territories ta on ta.id=ea.territory_id join public.territories tb on tb.id=eb.territory_id
 where ea.primary_source_id<>eb.primary_source_id and (ea.primary_source_id=source.id or eb.primary_source_id=source.id)
  and lower(trim(ea.title))=lower(trim(eb.title)) and nullif(lower(trim(ea.venue)),'')=nullif(lower(trim(eb.venue)),'')
  and ta.country_code=tb.country_code and ea.location is not null and eb.location is not null
  and extensions.st_dwithin(ea.location,eb.location,100) and a.start_at>=now() and not ea.is_demo and not eb.is_demo
 on conflict do nothing;
 update public.sources set last_success_at=fetched_at where id=source.id;
 update public.source_poll_state set token=null,lease_until=null,failures=0,last_error_code=null,next_poll_at=now()+make_interval(secs=>source.poll_interval_seconds) where source_id=source.id;
 insert into public.ingestion_runs(source_id,started_at,finished_at,status,diagnostic)
 values(source.id,fetched_at,now(),'success',metrics||jsonb_build_object('imported',imported,'adapter','s6-v1'));
 return imported;
end $$;

drop policy catalog_read on public.translations;
create policy ready_current_translation on public.translations for select to anon,authenticated using(
 status='ready' and exists(select 1 from public.events e join public.sources s on s.id=e.primary_source_id
  where e.id=event_id and e.version=translations.version and not e.is_demo and not s.is_demo and s.terms_status='allowed' and s.allow_translate));
create function public.s6_translation(selected_event uuid,selected_locale text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('title',title,'description',description,'summary',summary,'provider',provider,'version',version)
 from public.translations where event_id=selected_event and locale=selected_locale
 order by (provider like 'source:%') desc,provider limit 1
$$;
create function public.s6_source_coverage() returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',s.code,'name',s.name,'url',s.url,'license',s.rights_reference,
  'last_success_at',s.last_success_at,'fresh',coalesce(s.last_success_at+make_interval(secs=>s.freshness_seconds)>now(),false),
  'coverage',s.coverage_note,'future_sessions',counts.total,'mapped',counts.mapped,'known_prices',counts.prices) order by s.code),'[]'::jsonb)
 from public.sources s cross join lateral (
  select count(*) total,count(e.location) mapped,count(e.price) prices from public.events e join public.occurrences o on o.event_id=e.id
  where e.primary_source_id=s.id and not e.is_demo and e.status='scheduled' and o.status='scheduled'
   and ((o.time_kind='known' and o.start_at>=now()) or (o.time_kind='date_only' and o.local_date>=(now() at time zone coalesce(o.timezone,'UTC'))::date))
 ) counts where s.code in ('madrid','toronto','helsinki') and s.terms_status='allowed' and not s.is_demo
$$;
revoke all on function public.claim_s6_source(text,boolean),public.fail_s6_source(text,uuid,text),public.ingest_s6_source(text,jsonb,timestamptz,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_s6_source(text,boolean),public.fail_s6_source(text,uuid,text),public.ingest_s6_source(text,jsonb,timestamptz,uuid,jsonb) to service_role;
revoke all on function public.s6_translation(uuid,text),public.s6_source_coverage() from public;
grant execute on function public.s6_translation(uuid,text),public.s6_source_coverage() to anon,authenticated;
