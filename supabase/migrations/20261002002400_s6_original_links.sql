-- Explicit public HTTPS organizer links from source fields; worker fetch endpoints stay allowlisted.
create or replace function public.ingest_s6_source(source_code text,batch jsonb,fetched_at timestamptz,claim_token uuid,metrics jsonb) returns integer
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
  when 'toronto' then '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:443)?/'
  else '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:443)?/' end;
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

