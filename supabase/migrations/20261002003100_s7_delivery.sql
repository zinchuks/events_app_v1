-- Separate S7 durable transport from the legacy S3 manual proof commands.
create or replace function public.claim_s3_notification(job_transport text,selected_job uuid default null)
returns setof public.notification_jobs language sql security definer set search_path='' as $$
 update public.notification_jobs j set status='claimed',attempts=attempts+1,lease_until=now()+interval '5 minutes'
 where j.id=(select id from public.notification_jobs where workflow='s3' and transport=job_transport and digest_id is not null
  and (selected_job is null or id=selected_job) and run_at<=now()
  and (status='pending' or (job_transport='fixture' and status='claimed' and lease_until<now()))
  order by run_at,id for update skip locked limit 1) returning j.*
$$;
alter table public.deliveries add column dispatch_token uuid;
alter table public.deliveries add column dispatched_at timestamptz;
alter table public.deliveries add column next_receipt_at timestamptz;
alter table public.deliveries add column receipt_attempts integer not null default 0;
create unique index s7_delivery_device on public.deliveries(job_id,device_token_id) where dispatch_token is not null;

create function public.s7_push_allowed(j public.notification_jobs) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare entry jsonb; r public.rules; q jsonb; local_now timestamp; start_time time; end_time time; until_time timestamptz:=now(); finish date; end_instant timestamptz;
begin
 if j.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if not exists(select 1 from public.profiles where id=j.user_id and push_enabled) then return jsonb_build_object('status','opt_out'); end if;
 for entry in select value from jsonb_array_elements(j.rule_snapshot) loop
  select * into r from public.rules where id=(entry->>'id')::uuid and user_id=j.user_id;
  if not found or not r.enabled or r.delivery_schedule->'active' is distinct from 'true'::jsonb or r.schedule_revision<>(entry->>'revision')::bigint then return jsonb_build_object('status','rule_changed'); end if;
  q:=r.delivery_schedule->'quiet';
  if q is not null then
   local_now:=now() at time zone r.timezone;start_time:=(q->>'start')::time;end_time:=(q->>'end')::time;
   if (start_time<end_time and local_now::time>=start_time and local_now::time<end_time)
    or (start_time>end_time and (local_now::time>=start_time or local_now::time<end_time)) then
    finish:=local_now::date+case when start_time>end_time and local_now::time>=start_time then 1 else 0 end;
    select max(u) into end_instant from generate_series(((finish+end_time) at time zone r.timezone)-interval '26 hours',((finish+end_time) at time zone r.timezone)+interval '26 hours',interval '1 minute') u where u at time zone r.timezone=finish+end_time;
    until_time:=greatest(until_time,coalesce(end_instant,public.s7_local_instant(finish+end_time,r.timezone)));
   end if;
  end if;
 end loop;
 if until_time>now() then return jsonb_build_object('status','quiet','until',until_time); end if;
 return jsonb_build_object('status','allowed');
end $$;

create function public.claim_s7_notification() returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.notification_jobs; token uuid:=gen_random_uuid(); policy jsonb;
begin
 select * into j from public.notification_jobs where workflow='s7' and run_at<=now()
  and (status='pending' or (status='claimed' and lease_until<now())) order by run_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('status','idle'); end if;
 -- Crash after dispatch: retain uncertain outcome and never blindly send it again.
 update public.deliveries set status='uncertain',error_code='worker_lost_after_dispatch' where job_id=j.id and status='dispatching';
 policy:=public.s7_push_allowed(j);
 if policy->>'status'='quiet' then
  update public.notification_jobs set status='pending',run_at=(policy->>'until')::timestamptz,lease_until=null where id=j.id;
  return jsonb_build_object('status','quiet');
 elsif policy->>'status'<>'allowed' or j.attempts>=5 then
  update public.notification_jobs set status='sent',error_code=case when j.attempts>=5 then 'retry_limit' else policy->>'status' end,lease_until=null where id=j.id;
  return jsonb_build_object('status',coalesce(policy->>'status','retry_limit'));
 end if;
 update public.notification_jobs set status='claimed',attempts=attempts+1,lease_until=now()+interval '5 minutes',claim_token=token where id=j.id;
 return jsonb_build_object('status','claimed','id',j.id,'token',token,'digest_id',j.digest_id);
end $$;

create function public.begin_s7_delivery(selected_job uuid,claim uuid,device uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.notification_jobs; t public.device_tokens; delivery uuid; policy jsonb; language text;
begin
 select * into j from public.notification_jobs where id=selected_job and workflow='s7' and status='claimed' and claim_token=claim and lease_until>now() for update;
 if not found then return jsonb_build_object('status','lost_lease'); end if;
 policy:=public.s7_push_allowed(j);
 if policy->>'status'<>'allowed' then return policy; end if;
 select * into t from public.device_tokens where id=device and user_id=j.user_id;
 if not found then return jsonb_build_object('status','device_removed'); end if;
 if exists(select 1 from public.deliveries where job_id=j.id and device_token_id=t.id and dispatch_token is not null and status<>'retry') then return jsonb_build_object('status','already_attempted'); end if;
 insert into public.deliveries(job_id,user_id,device_token_id,status,dispatch_token,dispatched_at)
  values(j.id,j.user_id,t.id,'dispatching',claim,now())
 on conflict(job_id,device_token_id) where dispatch_token is not null do update set status='dispatching',dispatch_token=claim,dispatched_at=now(),error_code=null returning id into delivery;
 select locale into language from public.profiles where id=j.user_id;
 return jsonb_build_object('status','dispatch','delivery_id',delivery,'device_token',t.token,'locale',language,'digest_id',j.digest_id);
end $$;

create function public.finish_s7_delivery(selected_delivery uuid,claim uuid,result text,ticket text default null,error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.deliveries;
begin
 if result not in ('accepted','retry','rejected','uncertain','fixture_recorded') or (result='accepted' and (ticket is null or length(ticket) not between 1 and 200)) or length(error)>100 then raise exception 'Invalid transport result'; end if;
 update public.deliveries set status=result,receipt_id=ticket,error_code=error,next_receipt_at=case when result='accepted' then now()+interval '15 minutes' else null end
 where id=selected_delivery and dispatch_token=claim and status='dispatching' returning * into d;
 if not found then return false; end if;
 if error='DeviceNotRegistered' then delete from public.device_tokens where id=d.device_token_id and user_id=d.user_id; end if;
 return true;
end $$;
create function public.finish_s7_notification(selected_job uuid,claim uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare j public.notification_jobs; policy jsonb; retry boolean;
begin
 select * into j from public.notification_jobs where id=selected_job and workflow='s7' and status='claimed' and claim_token=claim for update;
 if not found then return false; end if;
 policy:=public.s7_push_allowed(j);
 select exists(select 1 from public.deliveries where job_id=j.id and status='retry') into retry;
 update public.notification_jobs set status=case when (retry or policy->>'status'='quiet') and j.attempts<5 then 'pending' else 'sent' end,
  run_at=case when policy->>'status'='quiet' then (policy->>'until')::timestamptz else now()+pg_catalog.make_interval(secs=>least(3600,30*power(2,j.attempts)::integer)) end,
  lease_until=null,error_code=case when policy->>'status'<>'allowed' then policy->>'status' when j.attempts>=5 and retry then 'retry_limit' else null end where id=j.id;
 return true;
end $$;
create function public.finish_s7_receipt(selected_delivery uuid,result text,error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.deliveries;
begin
 if result not in ('ok','error','missing') or length(error)>100 then raise exception 'Invalid receipt'; end if;
 update public.deliveries set status=case when result='ok' then 'receipt_ok' when result='error' then 'receipt_error'
   when dispatched_at<now()-interval '24 hours' then 'receipt_unknown' else 'accepted' end,
  error_code=error,receipt_attempts=receipt_attempts+1,
  next_receipt_at=now()+pg_catalog.make_interval(secs=>least(3600,900*power(2,least(receipt_attempts,3))::integer))
 where id=selected_delivery and status='accepted' returning * into d;
 if not found then return false; end if;
 if error='DeviceNotRegistered' then delete from public.device_tokens where id=d.device_token_id and user_id=d.user_id; end if;
 return true;
end $$;
do $$ declare signature text; begin
 foreach signature in array array['s7_push_allowed(public.notification_jobs)','claim_s7_notification()','begin_s7_delivery(uuid,uuid,uuid)',
  'finish_s7_delivery(uuid,uuid,text,text,text)','finish_s7_notification(uuid,uuid)','finish_s7_receipt(uuid,text,text)'] loop
  execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
  execute 'grant execute on function public.'||signature||' to service_role';
 end loop;
end $$;
