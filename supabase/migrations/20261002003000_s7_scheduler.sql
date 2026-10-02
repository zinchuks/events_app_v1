-- Durable scheduling. Cron wakes a worker; PostgreSQL owns dates, selections and identity.
create function public.s7_horizon_bounds(h jsonb,today date) returns table(lo date,hi date)
language plpgsql stable set search_path='' as $$
begin
 if jsonb_typeof(h) is distinct from 'object' or exists(select 1 from jsonb_object_keys(h) k where k not in ('kind','days','months','start','end')) then raise exception 'Invalid horizon'; end if;
 lo:=today;
 if h->>'kind'='days' then
  if jsonb_typeof(h->'days') is distinct from 'number' or (h->>'days')::numeric not between 1 and 366 or (h->>'days')::numeric<>trunc((h->>'days')::numeric) then raise exception 'Invalid days'; end if;
  hi:=today+(h->>'days')::integer;
 elsif h->>'kind'='months' then
  if jsonb_typeof(h->'months') is distinct from 'number' or (h->>'months')::numeric not between 1 and 12 or (h->>'months')::numeric<>trunc((h->>'months')::numeric) then raise exception 'Invalid months'; end if;
  hi:=(today+pg_catalog.make_interval(months=>(h->>'months')::integer))::date;
 elsif h->>'kind'='weekend' then
  lo:=today+case when extract(isodow from today)=7 then -1 else 6-extract(isodow from today)::integer end;
  hi:=lo+2;
 elsif h->>'kind'='range' then
  if coalesce(h->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(h->>'end','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid dates'; end if;
  lo:=(h->>'start')::date;hi:=(h->>'end')::date+1;
  if hi<=lo or hi-lo>366 then raise exception 'Invalid range'; end if;
 else raise exception 'Invalid horizon kind'; end if;
 return next;
end $$;

-- Resolve a fold to the first UTC instant. A gap moves to the earliest available
-- local minute, not the original minute plus the DST offset. Also handles skipped dates.
create function public.s7_local_instant(local_value timestamp,zone text) returns timestamptz
language plpgsql stable set search_path='' as $$
declare result timestamptz;
begin
 if not public.valid_timezone(zone) or local_value is null then raise exception 'Invalid local datetime'; end if;
 select u into result from generate_series((local_value at time zone zone)-interval '26 hours',
  (local_value at time zone zone)+interval '26 hours',interval '1 minute') u
 where u at time zone zone>=local_value order by u at time zone zone,u limit 1;
 return result;
end $$;
create function public.s7_next_run(d jsonb,zone text,after_time timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare day date; candidate timestamptz; n integer; base_day date;
begin
 if d->>'mode'='manual' or d->'active' is distinct from 'true'::jsonb then return null; end if;
 base_day:=(after_time at time zone zone)::date;
 if d->>'mode'='interval' then base_day:=greatest(base_day,(d->>'anchor')::date); end if;
 for n in 0..367 loop
  day:=base_day+n;
  if (d->>'mode'='weekdays' and not (d->'weekdays' @> to_jsonb(array[extract(isodow from day)::integer])))
   or (d->>'mode'='interval' and (day<(d->>'anchor')::date or (day-(d->>'anchor')::date)%(d->>'days')::integer<>0)) then continue; end if;
  candidate:=public.s7_local_instant(day+(d->>'time')::time,zone);
  if candidate>after_time then return candidate; end if;
 end loop;
 return null;
end $$;
alter table public.rules add column schedule_revision bigint not null default 0;
alter table public.rules add column schedule_retry_at timestamptz;
create index s7_due_rules on public.rules(next_run_at,user_id) where next_run_at is not null;
alter table public.digest_items add column matched_rule_names text[] not null default '{}';
alter table public.digest_items add column selection_snapshot jsonb;
alter table public.notification_jobs add column workflow text not null default 's3' check(workflow in ('s3','s7'));
alter table public.notification_jobs add column claim_token uuid;
alter table public.notification_jobs add column rule_snapshot jsonb;
alter table public.notification_jobs add column error_code text;
alter table public.notification_jobs add column expires_at timestamptz;
create table public.s7_runs(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 business_key text not null,rule_snapshot jsonb not null,scheduled_at timestamptz not null,
 created_at timestamptz not null default now(),outcome text not null check(outcome in ('empty','stale','ready','too_many')),
 digest_id uuid references public.digests(id) on delete cascade,unique(user_id,business_key)
);
create table public.s7_seen(
 user_id uuid not null references public.profiles(id) on delete cascade,
 occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 fingerprint text not null,primary key(user_id,occurrence_id)
);
alter table public.s7_runs enable row level security;
alter table public.s7_seen enable row level security;
revoke all on public.s7_runs,public.s7_seen from public,anon,authenticated;
grant select on public.s7_runs to authenticated;
create policy owner_read on public.s7_runs for select to authenticated using(user_id=(select auth.uid()));
grant all on public.s7_runs,public.s7_seen to service_role;

create or replace function public.validate_s5_delivery() returns trigger language plpgsql set search_path='' as $$
declare d jsonb:=new.delivery_schedule; v jsonb; q jsonb:=d->'quiet'; changed boolean;
begin
 if new.filters->>'scope' is distinct from 's4' then return new; end if;
 if d<>'{}'::jsonb then
  if jsonb_typeof(d) is distinct from 'object' or coalesce(d->>'mode','') not in ('manual','daily','weekdays','interval')
   or jsonb_typeof(d->'active') is distinct from 'boolean'
   or exists(select 1 from jsonb_object_keys(d) k where k not in ('mode','active','time','weekdays','days','anchor','quiet','repeat_unchanged')) then raise exception 'Invalid schedule'; end if;
  if d?'repeat_unchanged' and jsonb_typeof(d->'repeat_unchanged') is distinct from 'boolean' then raise exception 'Invalid repeat policy'; end if;
  if d->>'mode'<>'manual' and (jsonb_typeof(d->'time') is distinct from 'string' or d->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then raise exception 'Invalid local time'; end if;
  if d->>'mode'='manual' and (d->>'active')::boolean then raise exception 'Manual schedule cannot be active'; end if;
  if d->>'mode'='weekdays' then
   if jsonb_typeof(d->'weekdays') is distinct from 'array' or jsonb_array_length(d->'weekdays') not between 1 and 7 then raise exception 'Select weekdays'; end if;
   for v in select value from jsonb_array_elements(d->'weekdays') loop
    if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 1 and 7 or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) then raise exception 'Invalid weekday'; end if;
   end loop;
   if (select count(distinct value) from jsonb_array_elements(d->'weekdays'))<>jsonb_array_length(d->'weekdays') then raise exception 'Duplicate weekday'; end if;
  end if;
  if d->>'mode'='interval' then
   if jsonb_typeof(d->'days') is distinct from 'number' or (d->>'days')::numeric not between 1 and 366 or (d->>'days')::numeric<>trunc((d->>'days')::numeric)
    or jsonb_typeof(d->'anchor') is distinct from 'string' or d->>'anchor' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid interval'; end if;
   perform (d->>'anchor')::date;
  end if;
  if q is not null then
   if jsonb_typeof(q) is distinct from 'object' or (select count(*) from jsonb_object_keys(q))<>2
    or jsonb_typeof(q->'start') is distinct from 'string' or jsonb_typeof(q->'end') is distinct from 'string'
    or q->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or q->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or q->>'start'=q->>'end' then raise exception 'Invalid quiet hours'; end if;
  end if;
 end if;
 changed:=tg_op='INSERT';
 if tg_op='UPDATE' then
  changed:=row(new.enabled,new.timezone,new.delivery_schedule,new.filters,new.event_horizon,new.name)
   is distinct from row(old.enabled,old.timezone,old.delivery_schedule,old.filters,old.event_horizon,old.name);
 end if;
 if changed then new.schedule_revision:=new.schedule_revision+1;new.schedule_retry_at:=null; end if;
 if not new.enabled then new.next_run_at:=null;
 elsif changed or new.next_run_at is null then new.next_run_at:=public.s7_next_run(d,new.timezone,now()); end if;
 return new;
end $$;
create function public.s7_area_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.rules set schedule_revision=schedule_revision+1,next_run_at=null,schedule_retry_at=null
 where id=case when tg_op='DELETE' then old.rule_id else new.rule_id end and filters->>'scope'='s4';
 return null;
end $$;
create trigger s7_area_revision after insert or update or delete on public.rule_areas for each row execute function public.s7_area_revision();
create function public.set_s7_delivery_preferences(selected_rule uuid,delivery_preferences jsonb,rule_timezone text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or jsonb_typeof(delivery_preferences) is distinct from 'object' or rule_timezone is null or not public.valid_timezone(rule_timezone) then raise exception 'Invalid preference'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':rules',0));
 update public.rules set delivery_schedule=delivery_preferences,timezone=rule_timezone,next_run_at=null
 where id=selected_rule and user_id=auth.uid() and filters->>'scope'='s4';
 if not found then raise exception 'Rule not found' using errcode='42501'; end if;
end $$;
revoke all on function public.set_s7_delivery_preferences(uuid,jsonb,text) from public,anon;
grant execute on function public.set_s7_delivery_preferences(uuid,jsonb,text) to authenticated;

create or replace function public.validate_s4_rule() returns trigger
language plpgsql set search_path='' as $$
declare f jsonb := new.filters; h jsonb := new.event_horizon; v jsonb; k text; lo numeric; hi numeric;
begin
 if f->>'scope' is distinct from 's4' then return new; end if;
 if length(trim(new.name)) not between 1 and 100 or not public.valid_timezone(new.timezone)
  or jsonb_typeof(f)<>'object' or jsonb_typeof(h)<>'object' then raise exception 'Invalid rule'; end if;
 for k in select jsonb_object_keys(f) loop
  if k not in ('scope','categories','languages','include_unknown_language','price_min','price_max','currency','include_unknown_price','age_min','age_max','include_unknown_age') then raise exception 'Unknown filter'; end if;
 end loop;
 if jsonb_typeof(f->'categories') is distinct from 'array' or jsonb_array_length(f->'categories')>50
  or jsonb_typeof(f->'languages') is distinct from 'array' or jsonb_array_length(f->'languages')>20 then raise exception 'Invalid category/language list'; end if;
 for v in select value from jsonb_array_elements(f->'categories') loop
  if jsonb_typeof(v)<>'string' or not exists(select 1 from public.categories where code=v#>>'{}') then raise exception 'Invalid category'; end if;
 end loop;
 for v in select value from jsonb_array_elements(f->'languages') loop
  if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then raise exception 'Invalid event language'; end if;
 end loop;
 foreach k in array array['include_unknown_language','include_unknown_price','include_unknown_age'] loop
  if jsonb_typeof(f->k) is distinct from 'boolean' then raise exception 'Unknown-value policy required'; end if;
 end loop;
 foreach k in array array['price_min','price_max','age_min','age_max'] loop
  if f?k and f->k<>'null'::jsonb then
   if jsonb_typeof(f->k)<>'number' or (f->>k)::numeric<0 or (f->>k)::numeric>100000000 then raise exception 'Invalid numeric filter'; end if;
   if k like 'age_%' and ((f->>k)::numeric>120 or (f->>k)::numeric<>trunc((f->>k)::numeric)) then raise exception 'Invalid age'; end if;
  end if;
 end loop;
 lo:=(f->>'price_min')::numeric; hi:=(f->>'price_max')::numeric;
 if lo>hi then raise exception 'Reversed budget'; end if;
 if (lo is not null or hi is not null) and coalesce(f->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Explicit currency required'; end if;
 if f->>'currency' is not null and (f->>'currency') !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
 if (f->>'age_min')::integer>(f->>'age_max')::integer then raise exception 'Reversed age range'; end if;
 perform * from public.s7_horizon_bounds(h,current_date);
 return new;
end $$;
create function public.s7_matches(selected_owner uuid, selected_rules uuid[], matching_clock timestamptz)
returns table(occurrence_id uuid,rule_id uuid)
language sql stable security definer set search_path='' as $$
 select o.id,r.id from public.rules r join public.occurrences o on true join public.events e on e.id=o.event_id
 join public.sources s on s.id=e.primary_source_id
 cross join lateral (select (matching_clock at time zone r.timezone)::date as today) d
 cross join lateral public.s7_horizon_bounds(r.event_horizon,d.today) h
 where r.user_id=selected_owner and r.enabled and r.filters->>'scope'='s4' and (selected_rules is null or r.id=any(selected_rules))
  and not e.is_demo and not s.is_demo and s.terms_status='allowed' and e.status='scheduled' and o.status='scheduled'
  and exists(select 1 from public.rule_areas a where a.rule_id=r.id and a.user_id=r.user_id and public.s4_area_matches(a,e))
  and (jsonb_array_length(r.filters->'categories')=0 or r.filters->'categories'?e.category_code)
  and (jsonb_array_length(r.filters->'languages')=0 or r.filters->'languages'?e.event_language
   or (e.event_language is null and (r.filters->>'include_unknown_language')::boolean))
  and ((r.filters->>'currency' is null and r.filters->>'price_min' is null and r.filters->>'price_max' is null)
   or (e.price is null and (r.filters->>'include_unknown_price')::boolean)
   or (e.price is not null and e.currency=r.filters->>'currency' and (r.filters->>'price_min' is null or e.price>=(r.filters->>'price_min')::numeric)
    and (r.filters->>'price_max' is null or e.price<=(r.filters->>'price_max')::numeric)))
  and ((r.filters->>'age_min' is null and r.filters->>'age_max' is null)
   or ((e.age_min is null or e.age_max is null) and (r.filters->>'include_unknown_age')::boolean)
   or (e.age_min is not null and e.age_max is not null and (r.filters->>'age_min' is null or e.age_max>=(r.filters->>'age_min')::integer)
    and (r.filters->>'age_max' is null or e.age_min<=(r.filters->>'age_max')::integer)))
  and ((o.time_kind='known' and o.start_at>=matching_clock and (o.start_at at time zone r.timezone)::date>=h.lo and (o.start_at at time zone r.timezone)::date<h.hi)
   or (o.time_kind='date_only' and o.local_date>=greatest(d.today,h.lo) and o.local_date<h.hi))
$$;
revoke all on function public.s7_matches(uuid,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.s7_matches(uuid,uuid[],timestamptz) to service_role;
create or replace function public.s4_matches(selected_rule uuid default null)
returns table(occurrence_id uuid,rule_id uuid) language sql stable security definer set search_path='' as $$
 select * from public.s7_matches(auth.uid(),case when selected_rule is null then null else array[selected_rule] end,now())
$$;
create function public.run_s7_scheduler() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid; rule_ids uuid[]; snapshot jsonb; business text; scheduled timestamptz; ids uuid[];
 fresh boolean; digest uuid; notify boolean; outcome text; signatures jsonb; matches jsonb;
begin
 -- Lock the owner before rules: two workers cannot split the same due union.
 select p.id into caller from public.profiles p where exists(select 1 from public.rules r where r.user_id=p.id and r.next_run_at<=now() and coalesce(r.schedule_retry_at,r.next_run_at)<=now() and r.enabled and r.filters->>'scope'='s4')
 order by p.id for update skip locked limit 1;
 if caller is null then return jsonb_build_object('status','idle'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':rules',0));
 perform 1 from public.rules where user_id=caller and next_run_at<=now() and coalesce(schedule_retry_at,next_run_at)<=now() and enabled and filters->>'scope'='s4' order by id for update;
 select array_agg(id order by id),min(next_run_at),jsonb_agg(jsonb_build_object('id',id,'revision',schedule_revision,'due',next_run_at) order by id)
 into rule_ids,scheduled,snapshot from public.rules where user_id=caller and next_run_at<=now() and coalesce(schedule_retry_at,next_run_at)<=now() and enabled and filters->>'scope'='s4';
 if rule_ids is null then return jsonb_build_object('status','idle'); end if;
 business:='s7:'||md5(snapshot::text);
 -- MVCC snapshot captures the full union, metadata and versions together.
 select array_agg(o.id order by o.id),bool_and(coalesce(s.last_success_at>now()-pg_catalog.make_interval(secs=>s.freshness_seconds) and e.checked_at>now()-pg_catalog.make_interval(secs=>s.freshness_seconds),false)),
  jsonb_object_agg(o.id::text,md5(e.version::text||':'||o.time_kind||':'||coalesce(o.start_at::text,o.local_date::text,'')||':'||coalesce(o.end_at::text,''))),
  jsonb_object_agg(o.id::text,jsonb_build_object('rules',m.names,'title',e.title,'version',e.version,'start_at',o.start_at,'local_date',o.local_date,'time_kind',o.time_kind,'timezone',o.timezone))
 into ids,fresh,signatures,matches
 from (select occurrence_id,array_agg(distinct r.name order by r.name) names from public.s7_matches(caller,rule_ids,now()) m join public.rules r on r.id=m.rule_id group by occurrence_id) m
 join public.occurrences o on o.id=m.occurrence_id join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id;
 outcome:=case when ids is null then 'empty' when cardinality(ids)>5000 then 'too_many' when not fresh then 'stale' else 'ready' end;
 if outcome='ready' then
  select exists(select 1 from unnest(ids) x left join public.s7_seen z on z.user_id=caller and z.occurrence_id=x where z.fingerprint is distinct from signatures->>x::text)
   or exists(select 1 from public.rules where id=any(rule_ids) and delivery_schedule->'repeat_unchanged'='true'::jsonb) into notify;
  insert into public.digests(user_id,business_key,rule_name) values(caller,business,'S7') on conflict(user_id,business_key) do nothing returning id into digest;
  if digest is not null then
   insert into public.digest_items(digest_id,user_id,occurrence_id,matched_rule_names,selection_snapshot)
    select digest,caller,x,array(select jsonb_array_elements_text(matches->x::text->'rules')),matches->x::text from unnest(ids) x;
   insert into public.s7_seen(user_id,occurrence_id,fingerprint) select caller,x,signatures->>x::text from unnest(ids) x
    on conflict(user_id,occurrence_id) do update set fingerprint=excluded.fingerprint;
   insert into public.notification_jobs(user_id,business_key,run_at,digest_id,transport,workflow,rule_snapshot,status,error_code,expires_at)
    values(caller,business,now(),digest,'expo','s7',snapshot,case when notify then 'pending' else 'sent' end,case when notify then null else 'unchanged' end,now()+interval '24 hours');
  else select id into digest from public.digests where user_id=caller and business_key=business; end if;
 end if;
 insert into public.s7_runs(user_id,business_key,rule_snapshot,scheduled_at,outcome,digest_id) values(caller,business,snapshot,scheduled,outcome,digest) on conflict(user_id,business_key) do update set outcome=excluded.outcome,digest_id=excluded.digest_id;
 -- Coalesce missed runs after downtime, never replay weeks of push. Keep stale due
 -- slots for five minutes, preserving business identity, until data become usable.
 if outcome<>'stale' then
  update public.rules set next_run_at=public.s7_next_run(delivery_schedule,timezone,now()),schedule_retry_at=null where id=any(rule_ids);
 else
  update public.rules set schedule_retry_at=now()+interval '5 minutes' where id=any(rule_ids);
 end if;
 return jsonb_build_object('status',outcome,'digest_id',digest,'items',coalesce(cardinality(ids),0),'notify',notify);
end $$;
revoke all on function public.run_s7_scheduler() from public,anon,authenticated;
grant execute on function public.run_s7_scheduler() to service_role;
revoke all on function public.s7_area_revision() from public,anon,authenticated;
