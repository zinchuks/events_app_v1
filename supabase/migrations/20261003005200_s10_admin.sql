-- Server-checked operational roles. Never trust signup metadata or client role flags.
create table public.s10_roles (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 role text not null check(role in ('viewer','editor','admin')),
 assigned_at timestamptz not null default now()
);
create table public.s10_audit (
 id uuid primary key default gen_random_uuid(), actor uuid references public.profiles(id) on delete set null,
 action text not null, target uuid, reason text not null check(length(trim(reason)) between 5 and 500),
 before_state jsonb, after_state jsonb, created_at timestamptz not null default now()
);
create table public.s10_merges (
 occurrence_id uuid primary key references public.occurrences(id) on delete cascade,
 canonical_id uuid not null references public.occurrences(id) on delete cascade,
 check(occurrence_id<>canonical_id)
);
alter table public.sources add column poll_enabled boolean not null default true;
alter table public.sources add column admin_revision bigint not null default 1;
do $$ declare t text; begin
 foreach t in array array['s10_roles','s10_audit','s10_merges'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
create function public.s10_require(required_role text default 'viewer') returns text
language plpgsql stable security definer set search_path='' as $$
declare assigned text;
begin
 select role into assigned from public.s10_roles where user_id=auth.uid();
 if assigned is null or (required_role='editor' and assigned='viewer') or (required_role='admin' and assigned<>'admin')
  or required_role not in ('viewer','editor','admin') or required_role is null then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 return assigned;
end $$;
-- Trusted operator only. Every grant/revoke is audited; the browser cannot call this RPC.
create function public.set_s10_role(selected_owner uuid,assigned_role text,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if reason is null or length(trim(reason)) not between 5 and 500 or (assigned_role is not null and assigned_role not in ('viewer','editor','admin')) then raise exception 'Invalid role assignment'; end if;
 perform pg_advisory_xact_lock(hashtextextended(selected_owner::text||':admin-role',0));
 select to_jsonb(r) into previous from public.s10_roles r where user_id=selected_owner;
 if assigned_role is null then delete from public.s10_roles where user_id=selected_owner;
 else insert into public.s10_roles(user_id,role) values(selected_owner,assigned_role) on conflict(user_id) do update set role=excluded.role,assigned_at=now(); end if;
 insert into public.s10_audit(action,target,reason,before_state,after_state) values('operator_role',selected_owner,reason,previous,jsonb_build_object('role',assigned_role));
end $$;
create function public.s10_dashboard() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare assigned text:=public.s10_require(); result jsonb;
begin
 select jsonb_build_object('role',assigned,'as_of',now(),
 'sources',coalesce((select jsonb_agg(to_jsonb(x) order by x.code) from (
  select s.*,p.next_poll_at,p.lease_until,p.failures,p.last_error_code,
   coalesce(s.last_success_at+make_interval(secs=>s.freshness_seconds)>now(),false) as fresh,
   s.code in ('madrid','toronto','helsinki') as adapter_available,
   (select count(*) from public.events e where e.primary_source_id=s.id and not e.is_demo) as records,
   (select count(*) from public.events e where e.primary_source_id=s.id and not e.is_demo and e.checked_at+make_interval(secs=>s.freshness_seconds)<=now()) as stale_records,
   (select count(*) from public.events e join public.occurrences o on o.event_id=e.id where e.primary_source_id=s.id and not e.is_demo and o.status='scheduled' and e.status='scheduled' and (o.start_at>now() or o.local_date>=(now() at time zone coalesce(o.timezone,'UTC'))::date)) as future_sessions
  from public.sources s left join public.source_poll_state p on p.source_id=s.id where not s.is_demo
 ) x),'[]'::jsonb),
 'imports',coalesce((select jsonb_agg(to_jsonb(x)) from (select r.id,s.code,r.started_at,r.finished_at,r.status,
  r.diagnostic->'imported' as imported,r.diagnostic->'error_code' as error_code from public.ingestion_runs r join public.sources s on s.id=r.source_id where not s.is_demo order by r.started_at desc limit 50) x),'[]'::jsonb),
 'jobs',coalesce((select jsonb_agg(to_jsonb(x)) from (select status,error_code,count(*) as count from public.notification_jobs group by status,error_code) x),'[]'::jsonb),
 'scheduler',coalesce((select jsonb_agg(to_jsonb(x)) from (select outcome,count(*) as count from public.s7_runs where created_at>now()-interval '7 days' group by outcome) x),'[]'::jsonb),
 'deliveries',coalesce((select jsonb_agg(to_jsonb(x)) from (select status,count(*) as count from public.deliveries group by status) x),'[]'::jsonb),
 'ai',jsonb_build_object('settings',(select to_jsonb(c) from public.s6_ai_settings c),'days',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.s6_ai_days order by day desc limit 14) x),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(x)) from (select status,currency,count(*) as count,sum(charge) as charged,sum(ceiling) as reserved_ceiling from public.s6_ai_requests group by status,currency) x),'[]'::jsonb)),
 'duplicates',coalesce((select jsonb_agg(to_jsonb(x)) from (select d.*,public.s8_snapshot(d.left_occurrence) as left_snapshot,public.s8_snapshot(d.right_occurrence) as right_snapshot from public.duplicate_candidates d order by (status='pending') desc,created_at desc limit 100) x),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.s10_audit order by created_at desc limit 50) x),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.s10_source(document jsonb,reason text,selected_source uuid default null,expected_revision bigint default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare old_source public.sources; changed public.sources; result uuid;
begin
 perform public.s10_require('admin');
 if reason is null or length(trim(reason)) not between 5 and 500 or jsonb_typeof(document) is distinct from 'object'
 or document-array['code','name','url','acquisition','terms_status','rights_reference','allow_cache','allow_translate','allow_images','poll_interval_seconds','freshness_seconds','coverage_note','poll_enabled']<>'{}'::jsonb
 or coalesce(document->>'code','') !~ '^[a-z][a-z0-9_-]{1,39}$' or coalesce(length(trim(document->>'name')),0) not between 1 and 400
 or coalesce(document->>'url','') !~ '^https://[^/@[:space:]]+(/|$)' or length(document->>'url')>3000
 or coalesce(document->>'rights_reference','') !~ '^https://[^/@[:space:]]+(/|$)' or length(document->>'rights_reference')>3000
 or coalesce(document->>'acquisition','') not in ('api','ics','html') or coalesce(document->>'terms_status','') not in ('unreviewed','allowed','blocked')
 or jsonb_typeof(document->'poll_enabled') is distinct from 'boolean' or jsonb_typeof(document->'allow_cache') is distinct from 'boolean'
 or jsonb_typeof(document->'allow_translate') is distinct from 'boolean' or jsonb_typeof(document->'allow_images') is distinct from 'boolean'
 or (document->>'poll_interval_seconds')::integer is null or (document->>'poll_interval_seconds')::integer not between 300 and 604800
 or (document->>'freshness_seconds')::integer is null or (document->>'freshness_seconds')::integer not between 300 and 1209600
 or coalesce(length(document->>'coverage_note'),0) not between 5 and 2000 then raise exception 'Invalid source document'; end if;
 if selected_source is null then
  -- Registry entry never installs a scraper or enables an unreviewed adapter.
  if (document->>'poll_enabled')::boolean or document->>'terms_status'<>'unreviewed' or (document->>'allow_cache')::boolean or (document->>'allow_translate')::boolean or (document->>'allow_images')::boolean then raise exception 'New source must be disabled and unreviewed'; end if;
  insert into public.sources(code,name,url,acquisition,terms_status,rights_reference,allow_cache,allow_translate,allow_images,poll_interval_seconds,freshness_seconds,coverage_note,poll_enabled)
  values(document->>'code',document->>'name',document->>'url',document->>'acquisition','unreviewed',document->>'rights_reference',false,false,false,(document->>'poll_interval_seconds')::integer,(document->>'freshness_seconds')::integer,document->>'coverage_note',false) returning * into changed;
 else
  -- Import order: poll fence -> source advisory fence -> source row. Invalidate outstanding fetch.
  insert into public.source_poll_state(source_id) values(selected_source) on conflict do nothing;
  perform 1 from public.source_poll_state where source_id=selected_source for update;
  select * into old_source from public.sources where id=selected_source;
  perform pg_advisory_xact_lock(hashtextextended(old_source.url,0));
  select * into old_source from public.sources where id=selected_source for update;
  if old_source.id is null or old_source.is_demo or expected_revision is distinct from old_source.admin_revision then raise exception 'Source revision conflict' using errcode='40001'; end if;
  if document->>'code' is distinct from old_source.code or document->>'url' is distinct from old_source.url or document->>'acquisition' is distinct from old_source.acquisition then raise exception 'Source identity is immutable; create a separate reviewed entry'; end if;
  if (document->>'poll_enabled')::boolean and old_source.code not in ('madrid','toronto','helsinki') then raise exception 'No reviewed adapter'; end if;
  update public.sources set name=document->>'name',terms_status=document->>'terms_status',rights_reference=document->>'rights_reference',allow_cache=(document->>'allow_cache')::boolean,
   allow_translate=(document->>'allow_translate')::boolean,allow_images=(document->>'allow_images')::boolean,poll_interval_seconds=(document->>'poll_interval_seconds')::integer,
   freshness_seconds=(document->>'freshness_seconds')::integer,coverage_note=document->>'coverage_note',poll_enabled=(document->>'poll_enabled')::boolean,admin_revision=admin_revision+1 where id=selected_source returning * into changed;
  update public.source_poll_state set token=null,lease_until=null where source_id=selected_source;
 end if;
 result:=changed.id;
 insert into public.s10_audit(actor,action,target,reason,before_state,after_state) values(auth.uid(),'source_save',result,reason,to_jsonb(old_source),to_jsonb(changed));
 return result;
end $$;
create function public.s10_delete_source(selected_source uuid,expected_revision bigint,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare s public.sources;
begin
 perform public.s10_require('admin');
 if reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Reason required'; end if;
 insert into public.source_poll_state(source_id) values(selected_source) on conflict do nothing;
 perform 1 from public.source_poll_state where source_id=selected_source for update;
 select * into s from public.sources where id=selected_source;
 perform pg_advisory_xact_lock(hashtextextended(s.url,0));
 select * into s from public.sources where id=selected_source for update;
 if s.id is null or s.is_demo or s.admin_revision is distinct from expected_revision then raise exception 'Source revision conflict' using errcode='40001'; end if;
 if s.code in ('madrid','toronto','helsinki') or exists(select 1 from public.events where primary_source_id=s.id)
 or exists(select 1 from public.source_records where source_id=s.id) or exists(select 1 from public.ingestion_runs where source_id=s.id) then raise exception 'Referenced source: disable polling; preserve provenance'; end if;
 delete from public.source_poll_state where source_id=s.id;
 delete from public.sources where id=s.id;
 insert into public.s10_audit(actor,action,target,reason,before_state) values(auth.uid(),'source_delete',s.id,reason,to_jsonb(s));
end $$;
create function public.s10_event(selected_occurrence uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.s10_require();
 return (select jsonb_build_object('id',o.id,'version',e.version,'snapshot',public.s8_snapshot(o.id),'patch',c.patch,'source',s.code,'checked_at',e.checked_at,'reason',c.reason)
 from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id left join public.s8_corrections c on c.occurrence_id=o.id where o.id=selected_occurrence);
end $$;
create function public.s10_search(query text,page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform public.s10_require();
 if query is null or length(query)>120 or page_offset is null or page_offset not between 0 and 10000 then raise exception 'Invalid search'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select o.id,e.title,e.version,s.code,e.checked_at,o.start_at,o.local_date,o.time_kind,o.status,c.patch from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id left join public.s8_corrections c on c.occurrence_id=o.id
 where not e.is_demo and (trim(query)='' or strpos(lower(e.title),lower(trim(query)))>0) order by e.checked_at desc,o.id limit 30 offset page_offset) x),'[]'::jsonb);
end $$;
create function public.s10_correct(selected_occurrence uuid,expected_version integer,patch jsonb,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare source_url text; current_version integer; previous jsonb;
begin
 perform public.s10_require('editor');
 select s.url into source_url from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id where o.id=selected_occurrence;
 if source_url is null then raise exception 'Unknown occurrence'; end if;
 perform pg_advisory_xact_lock(hashtextextended(source_url,0));
 select e.version into current_version from public.events e join public.occurrences o on o.event_id=e.id where o.id=selected_occurrence for update of e,o;
 if expected_version is distinct from current_version then raise exception 'Event revision conflict' using errcode='40001'; end if;
 if (select count(*) from public.occurrences where event_id=(select event_id from public.occurrences where id=selected_occurrence))<>1 then raise exception 'Multi-session correction requires separate review'; end if;
 previous:=public.s10_event(selected_occurrence);
 perform public.correct_s8_occurrence(selected_occurrence,patch,reason);
 insert into public.s10_audit(actor,action,target,reason,before_state,after_state) values(auth.uid(),'event_correct',selected_occurrence,reason,previous,public.s10_event(selected_occurrence));
end $$;

-- Private normalized baseline only (bounded by existing importer validation), no provider credentials/raw transport.
create table public.s10_provider_facts (
 occurrence_id uuid primary key references public.occurrences(id) on delete cascade,
 record jsonb not null, checked_at timestamptz not null
);
alter table public.s10_provider_facts enable row level security;
revoke all on public.s10_provider_facts from anon,authenticated;
grant all on public.s10_provider_facts to service_role;
-- Do not publish original provider translations as a corrected version. Merge manual fields.
-- Forward-only S6 importer: preserve audited S8 manual overrides.
-- Explicit Helsinki cancellation updates preserve saved occurrence IDs; absence is never cancellation.
create or replace function public.ingest_s6_source(source_code text,batch jsonb,fetched_at timestamptz,claim_token uuid,metrics jsonb) returns integer
language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare source public.sources; r jsonb; o jsonb; tr jsonb; record uuid; event uuid; occurrence uuid;
 old_hash text; changed boolean; imported integer:=0; territory uuid; position extensions.geography;
 event_version integer; expected_timezone text; permitted_url text; correction jsonb; provider_record jsonb;
begin
 if source_code is null or source_code not in ('madrid','toronto','helsinki') or claim_token is null
  or jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch) not between 1 and 2000
  or fetched_at is null or fetched_at>now()+interval '5 minutes' or fetched_at<now()-interval '15 minutes'
  or jsonb_typeof(metrics) is distinct from 'object' or length(metrics::text)>2000
 then raise exception 'Invalid import' using errcode='22023'; end if;
 select * into source from public.sources where code=source_code and terms_status='allowed' and allow_cache and poll_enabled and not is_demo;
 if source.id is null then raise exception 'Unapproved source'; end if;
 perform 1 from public.source_poll_state where source_id=source.id and token=claim_token and lease_until>now() for update;
 if not found then raise exception 'Invalid or expired source lease'; end if;
 -- Serialize with the legacy Madrid importer too; preserve saved/digest occurrence IDs.
 perform pg_advisory_xact_lock(hashtextextended(source.url,0));
 select * into source from public.sources where id=source.id;
 if not source.poll_enabled or source.terms_status<>'allowed' or not source.allow_cache then raise exception 'Source disabled'; end if;
 expected_timezone:=case source_code when 'madrid' then 'Europe/Madrid' when 'toronto' then 'America/Toronto' else 'Europe/Helsinki' end;
 permitted_url:=case source_code when 'madrid' then '^https?://(www\.)?madrid\.es/'
  when 'toronto' then '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:443)?/'
  else '^https://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:443)?/' end;
 if (select count(distinct value->>'external_id') from jsonb_array_elements(batch))<>jsonb_array_length(batch) then raise exception 'Duplicate identity'; end if;
 for r in select value from jsonb_array_elements(batch) loop
  provider_record:=r;
  expected_timezone:=case source_code when 'madrid' then 'Europe/Madrid' when 'toronto' then 'America/Toronto' else 'Europe/Helsinki' end;
  if jsonb_typeof(r) is distinct from 'object' or coalesce(length(r->>'external_id'),0) not between 1 and 500
   or r->>'hash' is null or r->>'hash' !~ '^[a-f0-9]{64}$' or coalesce(length(trim(r->>'title')),0) not between 1 and 400
   or coalesce(length(r->>'description'),0)>20000 or coalesce(length(r->>'venue'),0)>400
   or r->>'url' is null or r->>'url' !~ permitted_url or length(r->>'url')>3000
   or jsonb_typeof(r->'occurrences') is distinct from 'array' or jsonb_array_length(r->'occurrences')<>1
   or coalesce(r->>'status','scheduled') not in ('scheduled','cancelled')
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
  -- Source hash/provenance remains original. Operator overlay applies only after
  -- provider validation, before normalized comparisons/writes. No silent reimport revert.
  select c.patch into correction from public.s8_corrections c join public.occurrences oc on oc.id=c.occurrence_id
   where oc.event_id=event and oc.external_id=o->>'external_id';
  insert into public.s10_provider_facts(occurrence_id,record,checked_at)
  select oc.id,provider_record,fetched_at from public.occurrences oc where oc.event_id=event and oc.external_id=o->>'external_id'
  on conflict(occurrence_id) do update set record=excluded.record,checked_at=excluded.checked_at;
  if correction is not null then
   r:=r||(correction-array['time_kind','start_at','end_at','local_date','timezone']);
   o:=o||(correction-array['title','venue','price','currency','status']);
   expected_timezone:=o->>'timezone';
  end if;
  -- Defend versioning even if a buggy caller supplies an unchanged hash for changed facts.
  changed:=changed or exists(select 1 from public.events e where id=event and
   (e.title is distinct from r->>'title' or e.description is distinct from r->>'description' or e.venue is distinct from r->>'venue'
    or e.category_code is distinct from r->>'category_code' or e.territory_id is distinct from territory
    or e.price is distinct from (r->>'price')::numeric or e.currency is distinct from r->>'currency'
    or e.original_language is distinct from r->>'original_language'
    or e.status is distinct from coalesce(r->>'status','scheduled') or e.location::text is distinct from position::text));
  changed:=changed or exists(select 1 from public.occurrences oc where event_id=event and external_id=o->>'external_id' and
   (oc.time_kind is distinct from o->>'time_kind' or oc.start_at is distinct from (o->>'start_at')::timestamptz
    or oc.end_at is distinct from (o->>'end_at')::timestamptz or oc.local_date is distinct from (o->>'local_date')::date
    or oc.timezone is distinct from expected_timezone));
  insert into public.events(id,primary_source_id,canonical_url,checked_at,title,description,venue,category_code,territory_id,location,price,currency,original_language,status,is_demo)
  values(event,source.id,r->>'url',fetched_at,r->>'title',r->>'description',r->>'venue',r->>'category_code',territory,position,(r->>'price')::numeric,r->>'currency',r->>'original_language',coalesce(r->>'status','scheduled'),false)
  on conflict(id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at,title=excluded.title,description=excluded.description,
   venue=excluded.venue,category_code=excluded.category_code,territory_id=excluded.territory_id,location=excluded.location,price=excluded.price,currency=excluded.currency,
   original_language=excluded.original_language,status=excluded.status,version=public.events.version+case when changed then 1 else 0 end
  returning version into event_version;
  insert into public.occurrences(event_id,external_id,time_kind,start_at,end_at,local_date,timezone,status)
  values(event,o->>'external_id',o->>'time_kind',(o->>'start_at')::timestamptz,(o->>'end_at')::timestamptz,(o->>'local_date')::date,expected_timezone,coalesce(r->>'status','scheduled'))
  on conflict(event_id,external_id) do update set time_kind=excluded.time_kind,start_at=excluded.start_at,end_at=excluded.end_at,local_date=excluded.local_date,timezone=excluded.timezone,status=excluded.status
  returning id into occurrence;
  insert into public.s10_provider_facts(occurrence_id,record,checked_at) values(occurrence,provider_record,fetched_at)
  on conflict(occurrence_id) do update set record=excluded.record,checked_at=excluded.checked_at;
  insert into public.event_sources(occurrence_id,source_record_id,canonical_url,checked_at) values(occurrence,record,r->>'url',fetched_at)
  on conflict(occurrence_id,source_record_id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at;
  if correction is null and r->'translations' is not null then
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



create or replace function public.claim_s6_source(source_code text, force_poll boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare source uuid; claim uuid:=gen_random_uuid(); state public.source_poll_state;
begin
 select id into source from public.sources where code=source_code and code in ('madrid','toronto','helsinki')
  and terms_status='allowed' and allow_cache and poll_enabled and not is_demo;
 if force_poll is null then raise exception 'Invalid poll'; end if;
 if source is null then return null; end if;
 insert into public.source_poll_state(source_id) values(source) on conflict do nothing;
 select * into state from public.source_poll_state where source_id=source for update;
 if not exists(select 1 from public.sources where id=source and poll_enabled and terms_status='allowed' and allow_cache) then return null; end if;
 if state.lease_until>now() or (not force_poll and state.next_poll_at>now()) then return null; end if;
 update public.source_poll_state set token=claim,lease_until=now()+interval '4 minutes' where source_id=source;
 return claim;
end $$;
create or replace function public.fail_s6_source(source_code text, claim_token uuid, error_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if error_code is null or error_code not in ('fetch_failed','normalize_failed','import_failed','lease_expired') then raise exception 'Invalid diagnostic'; end if;
 update public.source_poll_state p set token=null,lease_until=null,failures=least(30,failures+1),last_error_code=error_code,
  next_poll_at=now()+make_interval(secs=>least(86400,300*power(2,least(failures,9)))::integer)
 from public.sources s where s.id=p.source_id and s.code=source_code and p.token=claim_token;
 if found then insert into public.ingestion_runs(source_id,status,finished_at,diagnostic) select id,'failed',now(),jsonb_build_object('error_code',error_code) from public.sources where code=source_code; end if;
 -- Never mark the source healthy on failure; no raw HTTP body/keys in diagnostics.
end $$;

-- Derived occurrence time changes invalidate version even with unchanged raw hash.
-- Derived taxonomy/text changes also invalidate event version.
-- Server-only allowlisted import. The complete batch commits or rolls back.
create or replace function public.ingest_madrid(batch jsonb, fetched_at timestamptz) returns integer
language plpgsql security definer set search_path='' set statement_timeout='120s' as $$
declare source uuid; city uuid; row jsonb; record uuid; event uuid; occurrence uuid;
 old_hash text; correction jsonb; changed boolean; imported integer:=0;
 source_url constant text:='https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information';
begin
 if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch)>2000 or fetched_at is null
  or fetched_at>now()+interval '5 minutes' then raise exception 'Invalid batch' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(source_url,0));
 select id into source from public.sources where url=source_url and not is_demo order by id limit 1;
 if source is null then
  insert into public.sources(name,url,acquisition,terms_status,rights_reference,allow_cache,allow_translate,allow_images,poll_interval_seconds)
  values('Ayuntamiento de Madrid · CC BY 4.0',source_url,'api','allowed','https://datos.madrid.es/pages/condiciones-de-uso',true,true,false,86400) returning id into source;
 end if;
 if not exists(select 1 from public.sources where id=source and terms_status='allowed' and allow_cache and poll_enabled) then raise exception 'Source terms not allowed'; end if;
 select id into city from public.territories where external_id='madrid:municipio:Madrid' and not is_demo;
 for row in select value from jsonb_array_elements(batch) loop
  if row->>'external_id' is null or row->>'hash' !~ '^[a-f0-9]{64}$' or row->>'url' !~ '^https?://(www\.)?madrid\.es/'
    or row->'occurrence'->>'external_id' is distinct from row->>'external_id'
    or row->'occurrence'->>'timezone' is distinct from 'Europe/Madrid'
  then raise exception 'Invalid Madrid record' using errcode='22023'; end if;
  select id,payload_hash into record,old_hash from public.source_records where source_id=source and external_id=row->>'external_id';
  changed:=old_hash is distinct from row->>'hash';
  insert into public.source_records(source_id,external_id,payload_hash,fetched_at,canonical_url)
  values(source,row->>'external_id',row->>'hash',fetched_at,row->>'url')
  on conflict(source_id,external_id) do update set payload_hash=excluded.payload_hash,fetched_at=excluded.fetched_at,canonical_url=excluded.canonical_url
  returning id into record;
  select o.event_id into event from public.event_sources es join public.occurrences o on o.id=es.occurrence_id
   where es.source_record_id=record order by o.id limit 1;
  event:=coalesce(event,md5(source::text||':'||(row->>'external_id'))::uuid);
  select c.patch into correction from public.s8_corrections c join public.occurrences oc on oc.id=c.occurrence_id where oc.event_id=event and oc.external_id=row->'occurrence'->>'external_id';
  if correction is not null then row:=row||(correction-array['time_kind','start_at','end_at','local_date','timezone']); row:=jsonb_set(row,'{occurrence}',(row->'occurrence')||(correction-array['title','venue','price','currency','status'])); end if;
  changed:=changed or exists(select 1 from public.events where id=event and
    (title is distinct from row->>'title' or description is distinct from row->>'description'
     or venue is distinct from row->>'venue' or category_code is distinct from row->>'category_code'
     or territory_id is distinct from case when row->>'locality'='MADRID' then city else null end));
  changed:=changed or exists(select 1 from public.occurrences where event_id=event and external_id=row->>'external_id' and
    (time_kind is distinct from row->'occurrence'->>'time_kind'
     or start_at is distinct from (row->'occurrence'->>'start_at')::timestamptz
     or local_date is distinct from (row->'occurrence'->>'local_date')::date
     or timezone is distinct from row->'occurrence'->>'timezone'));
  insert into public.events(id,primary_source_id,canonical_url,checked_at,title,description,venue,category_code,territory_id,is_demo)
  values(event,source,row->>'url',fetched_at,row->>'title',row->>'description',row->>'venue',row->>'category_code',
    case when row->>'locality'='MADRID' then city else null end,false)
  on conflict(id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at,title=excluded.title,
   description=excluded.description,venue=excluded.venue,category_code=excluded.category_code,territory_id=excluded.territory_id,
   version=public.events.version+case when changed then 1 else 0 end;
  insert into public.occurrences(event_id,external_id,time_kind,start_at,local_date,timezone)
  values(event,row->>'external_id',row->'occurrence'->>'time_kind',(row->'occurrence'->>'start_at')::timestamptz,
    (row->'occurrence'->>'local_date')::date,'Europe/Madrid')
  on conflict(event_id,external_id) do update set time_kind=excluded.time_kind,start_at=excluded.start_at,local_date=excluded.local_date,timezone=excluded.timezone
  returning id into occurrence;
  insert into public.event_sources(occurrence_id,source_record_id,canonical_url,checked_at)
  values(occurrence,record,row->>'url',fetched_at)
  on conflict(occurrence_id,source_record_id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at;
  imported:=imported+1;
 end loop;
 update public.sources set last_success_at=fetched_at where id=source;
 insert into public.ingestion_runs(source_id,started_at,finished_at,status,diagnostic)
 values(source,fetched_at,now(),'success',jsonb_build_object('imported',imported,'subset','single-day non-recurring'));
 return imported;
end $$;

create function public.s10_reset_override(selected_occurrence uuid,expected_version integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare source public.sources; baseline public.s10_provider_facts; previous jsonb; patch jsonb; o jsonb; version_number integer;
begin
 perform public.s10_require('editor');
 select s.* into source from public.occurrences oc join public.events e on e.id=oc.event_id join public.sources s on s.id=e.primary_source_id where oc.id=selected_occurrence;
 if source.id is null then raise exception 'Unknown occurrence'; end if;
 perform pg_advisory_xact_lock(hashtextextended(source.url,0));
 select e.version into version_number from public.events e join public.occurrences oc on oc.event_id=e.id where oc.id=selected_occurrence for update of e,oc;
 if version_number is distinct from expected_version then raise exception 'Event revision conflict' using errcode='40001'; end if;
 select * into baseline from public.s10_provider_facts where occurrence_id=selected_occurrence;
 if baseline.occurrence_id is null or baseline.checked_at+make_interval(secs=>source.freshness_seconds)<=now() or source.terms_status<>'allowed' or not source.allow_cache then raise exception 'Fresh provider baseline required; import before removing override'; end if;
 previous:=public.s10_event(selected_occurrence);
 o:=baseline.record->'occurrences'->0;
 patch:=jsonb_build_object('title',baseline.record->>'title','venue',baseline.record->>'venue','price',baseline.record->'price','currency',baseline.record->>'currency',
 'status',coalesce(baseline.record->>'status','scheduled'),'time_kind',o->>'time_kind','start_at',o->>'start_at','end_at',o->>'end_at','local_date',o->>'local_date','timezone',o->>'timezone');
 perform public.s10_correct(selected_occurrence,expected_version,patch,reason);
 delete from public.s8_corrections where occurrence_id=selected_occurrence;
 insert into public.s10_audit(actor,action,target,reason,before_state,after_state) values(auth.uid(),'override_reset',selected_occurrence,reason,previous,public.s10_event(selected_occurrence));
end $$;
-- Conservative logical merge; originals remain intact for provenance, saved references and immutable history.
create function public.s10_same_session(a uuid,b uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(x.time_kind='known' and y.time_kind='known' and x.start_at=y.start_at
  and row(x.end_at,x.status,ex.status,lower(trim(ex.title)),lower(trim(ex.venue)),ex.category_code,ex.event_language,ex.price,ex.currency,tx.country_code)
   is not distinct from row(y.end_at,y.status,ey.status,lower(trim(ey.title)),lower(trim(ey.venue)),ey.category_code,ey.event_language,ey.price,ey.currency,ty.country_code)
  and ex.location is not null and ey.location is not null and extensions.st_dwithin(ex.location,ey.location,100),false)
 from public.occurrences x join public.events ex on ex.id=x.event_id join public.territories tx on tx.id=ex.territory_id,
 public.occurrences y join public.events ey on ey.id=y.event_id join public.territories ty on ty.id=ey.territory_id where x.id=a and y.id=b
$$;
create function public.s10_group(selected_occurrence uuid) returns uuid
language sql stable security definer set search_path='' as $$
 select coalesce((select m.canonical_id from public.s10_merges m where m.occurrence_id=selected_occurrence and public.s10_same_session(m.occurrence_id,m.canonical_id)),selected_occurrence)
$$;
create function public.s10_review_duplicate(left_id uuid,right_id uuid,canonical_id uuid,left_version integer,right_version integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare source_url text; previous jsonb; duplicate_id uuid;
begin
 perform public.s10_require('editor');
 if reason is null or length(trim(reason)) not between 5 and 500 or left_id is null or right_id is null or left_id>=right_id
 or (canonical_id is not null and canonical_id not in (left_id,right_id)) then raise exception 'Invalid review'; end if;
 perform pg_advisory_xact_lock(hashtextextended('s10:merge',0));
 for source_url in select distinct s.url from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id where o.id in (left_id,right_id) order by s.url loop
  perform pg_advisory_xact_lock(hashtextextended(source_url,0));
 end loop;
 perform 1 from public.events e join public.occurrences o on o.event_id=e.id where o.id in(left_id,right_id) order by e.id for update of e;
 perform 1 from public.occurrences where id in(left_id,right_id) order by id for update;
 select to_jsonb(d) into previous from public.duplicate_candidates d where left_occurrence=left_id and right_occurrence=right_id for update;
 if previous is null then raise exception 'Unknown duplicate candidate'; end if;
 if left_version is distinct from (select e.version from public.events e join public.occurrences o on o.event_id=e.id where o.id=left_id)
 or right_version is distinct from (select e.version from public.events e join public.occurrences o on o.event_id=e.id where o.id=right_id) then raise exception 'Duplicate revision conflict' using errcode='40001'; end if;
 if canonical_id is not null then
  if public.s10_same_session(left_id,right_id) is distinct from true then raise exception 'Session facts differ: correct or mark distinct'; end if;
  duplicate_id:=case when canonical_id=left_id then right_id else left_id end;
  if exists(select 1 from public.s10_merges where occurrence_id=canonical_id or canonical_id=duplicate_id or occurrence_id=duplicate_id) then raise exception 'Existing merge: undo it first; no chains'; end if;
  insert into public.s10_merges(occurrence_id,canonical_id) values(duplicate_id,canonical_id);
 else
  delete from public.s10_merges where (occurrence_id=left_id and s10_merges.canonical_id=right_id) or (occurrence_id=right_id and s10_merges.canonical_id=left_id);
 end if;
 update public.duplicate_candidates set status=case when canonical_id is null then 'distinct' else 'duplicate' end where left_occurrence=left_id and right_occurrence=right_id;
 insert into public.s10_audit(actor,action,target,reason,before_state,after_state) values(auth.uid(),'duplicate_review',coalesce(canonical_id,left_id),reason,previous,jsonb_build_object('left',left_id,'right',right_id,'canonical',canonical_id));
end $$;
-- Deduplicate the full eligible match union, retaining all matched rule names. If primary is ineligible,
-- choose an eligible member. Filters/billing checks remain inside the unchanged S9 matcher.
alter function public.s7_matches(uuid,uuid[],timestamptz) rename to s10_previous_matches;
create function public.s7_matches(selected_owner uuid,selected_rules uuid[],matching_clock timestamptz)
returns table(occurrence_id uuid,rule_id uuid) language sql stable security definer set search_path='' as $$
 with raw as materialized (select *,public.s10_group(m.occurrence_id) as group_id from public.s10_previous_matches(selected_owner,selected_rules,matching_clock) m),
 representatives as (select distinct on(group_id) group_id,raw.occurrence_id from raw order by group_id,(raw.occurrence_id=group_id) desc,raw.occurrence_id)
 select distinct p.occurrence_id,r.rule_id from raw r join representatives p using(group_id)
$$;
create or replace function public.list_s5_events(view_mode text default 'catalog', search_text text default '', page_offset integer default 0, page_size integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if view_mode is null or search_text is null or page_offset is null or page_size is null or view_mode not in ('catalog','matches') or length(search_text)>120 or page_offset not between 0 and 10000 or page_size not between 1 and 1000 then raise exception 'Invalid catalog request'; end if;
 if view_mode='matches' and auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 with matches as (
  select occurrence_id,array_agg(distinct rule_id order by rule_id) rules
  from public.s4_matches() where view_mode='matches' group by occurrence_id
 ), raw_eligible as (
  select o.id,o.event_id,o.time_kind,o.start_at,o.local_date,o.timezone,e.title,e.venue,e.category_code,e.checked_at,
   coalesce(m.rules,array[]::uuid[]) as matched_rules,
   case when e.location is not null then extensions.st_x(e.location::extensions.geometry) end as longitude,
   case when e.location is not null then extensions.st_y(e.location::extensions.geometry) end as latitude,
   coalesce(o.local_date,(o.start_at at time zone o.timezone)::date) as sort_date
  from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
  left join matches m on m.occurrence_id=o.id
  where not e.is_demo and not s.is_demo and s.terms_status='allowed' and e.status='scheduled' and o.status='scheduled'
   and (view_mode='catalog' or m.occurrence_id is not null)
   and ((o.time_kind='known' and o.start_at>=now()) or (o.time_kind='date_only' and o.local_date>=(now() at time zone coalesce(o.timezone,'UTC'))::date))
   and (trim(search_text)='' or strpos(lower(e.title||' '||coalesce(e.venue,'')||' '||coalesce(e.description,'')),lower(trim(search_text)))>0)
 ), eligible as (select distinct on(public.s10_group(id)) * from raw_eligible order by public.s10_group(id),(id=public.s10_group(id)) desc,id), page as (select * from eligible order by sort_date,start_at nulls last,id limit page_size offset page_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'sort_date' order by p.sort_date,p.start_at nulls last,p.id) from page p),'[]'::jsonb),
  'total',(select count(*) from eligible),'mapped',(select count(*) from eligible where longitude is not null and latitude is not null)) into result;
 return result;
end $$;

-- Every new function has an explicit privilege boundary (Postgres defaults EXECUTE to PUBLIC).
do $$ declare fn regprocedure; begin
 for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 's10_%' or p.proname='set_s10_role') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
  execute format('grant execute on function %s to service_role',fn);
 end loop;
end $$;
grant execute on function public.s10_dashboard(),public.s10_source(jsonb,text,uuid,bigint),public.s10_delete_source(uuid,bigint,text),public.s10_search(text,integer),public.s10_event(uuid),public.s10_correct(uuid,integer,jsonb,text),public.s10_reset_override(uuid,integer,text),public.s10_review_duplicate(uuid,uuid,uuid,integer,integer,text) to authenticated;
revoke all on function public.s7_matches(uuid,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.s7_matches(uuid,uuid[],timestamptz) to service_role;
