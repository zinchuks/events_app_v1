-- Preserve owner lock ordering; future periodic refresh is not pending restore.
create or replace function public.s9_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform public.s9_refresh_rules(owner_id);
 select jsonb_build_object('tier',public.s9_tier(owner_id),'limit',case when public.s9_tier(owner_id)='plus' then 10 else 1 end,
  'configured',(select enabled from public.s9_config),'expires_at',e.expires_at,'grace_until',e.grace_until,'verified_at',e.verified_at,
  'active_rules',coalesce((select jsonb_agg(id order by id) from public.rules where user_id=owner_id and public.s9_rule_allowed(id)),'[]'),
  'free_eligible',coalesce((select jsonb_agg(id order by id) from public.rules r where user_id=owner_id and public.s9_free_eligible(r)),'[]'),
  'reconcile_pending',exists(select 1 from public.s9_reconcile_queue where user_id=owner_id and (due_at<=now() or lease_until>now())))
 into result from (select 1) seed left join public.entitlements e on e.user_id=owner_id;
 return result;
end $$;
create or replace function public.run_s7_scheduler() returns jsonb language plpgsql security definer set search_path='' as $$
declare caller uuid; rule_ids uuid[]; snapshot jsonb; business text; scheduled timestamptz; ids uuid[];
 fresh boolean; digest uuid; notify boolean; outcome text; signatures jsonb; matches jsonb;
begin
 -- Lock the owner before rules: two workers cannot split the same due union.
 select p.id into caller from public.profiles p where exists(select 1 from public.rules r where r.user_id=p.id and r.next_run_at<=now() and coalesce(r.schedule_retry_at,r.next_run_at)<=now() and r.enabled and public.s9_rule_allowed(r.id) and r.filters->>'scope'='s4')
 order by p.id for update skip locked limit 1;
 if caller is null then return jsonb_build_object('status','idle'); end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':rules',0));
 perform 1 from public.rules where user_id=caller and next_run_at<=now() and coalesce(schedule_retry_at,next_run_at)<=now() and enabled and public.s9_rule_allowed(id) and filters->>'scope'='s4' order by id for update;
 select array_agg(id order by id),min(next_run_at),jsonb_agg(jsonb_build_object('id',id,'revision',schedule_revision,'due',next_run_at) order by id)
 into rule_ids,scheduled,snapshot from public.rules where user_id=caller and next_run_at<=now() and coalesce(schedule_retry_at,next_run_at)<=now() and enabled and public.s9_rule_allowed(id) and filters->>'scope'='s4';
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
