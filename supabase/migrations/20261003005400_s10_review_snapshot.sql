-- Bind review versions to displayed facts, never silently refresh just before merge.
create or replace function public.s10_dashboard() returns jsonb
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
 'duplicates',coalesce((select jsonb_agg(to_jsonb(x)) from (select d.*,(select e.version from public.occurrences o join public.events e on e.id=o.event_id where o.id=d.left_occurrence) as left_version,(select e.version from public.occurrences o join public.events e on e.id=o.event_id where o.id=d.right_occurrence) as right_version,public.s8_snapshot(d.left_occurrence) as left_snapshot,public.s8_snapshot(d.right_occurrence) as right_snapshot from public.duplicate_candidates d order by (status='pending') desc,created_at desc limit 100) x),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.s10_audit order by created_at desc limit 50) x),'[]'::jsonb)) into result;
 return result;
end $$;
