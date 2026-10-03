-- Bound provider TTL by the same event-start deadline checked at dispatch.
create or replace function public.begin_s7_delivery(selected_job uuid,claim uuid,device uuid) returns jsonb
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
 return jsonb_build_object('status','dispatch','delivery_id',delivery,'device_token',t.token,'locale',language,'digest_id',j.digest_id,'ttl_seconds',greatest(0,least(3600,floor(extract(epoch from j.expires_at-now()))::integer)));
end $$;
