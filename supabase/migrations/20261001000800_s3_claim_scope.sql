drop function public.claim_s3_notification(text);
create function public.claim_s3_notification(job_transport text, selected_job uuid default null) returns setof public.notification_jobs
language sql security definer set search_path='' as $$
 update public.notification_jobs j set status='claimed',attempts=attempts+1,lease_until=now()+interval '5 minutes'
 where j.id=(select id from public.notification_jobs where transport=job_transport and digest_id is not null
  and (selected_job is null or id=selected_job) and run_at<=now()
  and (status='pending' or (transport='fixture' and status='claimed' and lease_until<now()))
  order by run_at,id for update skip locked limit 1)
 returning j.*
$$;
revoke all on function public.claim_s3_notification(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_s3_notification(text,uuid) to service_role;
