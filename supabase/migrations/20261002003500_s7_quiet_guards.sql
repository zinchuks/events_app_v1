-- Deterministic quiet-hours calculation enables gap/fold tests without changing DB time.
create function public.s7_quiet_until(q jsonb,zone text,clock_time timestamptz) returns timestamptz
language plpgsql stable set search_path='' as $$
declare local_now timestamp; start_time time; end_time time; finish date; end_instant timestamptz;
begin
 if q is null then return clock_time; end if;
 local_now:=clock_time at time zone zone;start_time:=(q->>'start')::time;end_time:=(q->>'end')::time;
 if (start_time<end_time and local_now::time>=start_time and local_now::time<end_time)
  or (start_time>end_time and (local_now::time>=start_time or local_now::time<end_time)) then
  finish:=local_now::date+case when start_time>end_time and local_now::time>=start_time then 1 else 0 end;
  select max(u) into end_instant from generate_series(((finish+end_time) at time zone zone)-interval '26 hours',((finish+end_time) at time zone zone)+interval '26 hours',interval '1 minute') u where u at time zone zone=finish+end_time;
  -- End a quiet range at the later fold boundary, keeping both repeated hours quiet.
  return coalesce(end_instant,public.s7_local_instant(finish+end_time,zone));
 end if;
 return clock_time;
end $$;
create or replace function public.s7_push_allowed(j public.notification_jobs) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare entry jsonb; r public.rules; until_time timestamptz:=now();
begin
 if j.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if not exists(select 1 from public.profiles where id=j.user_id and push_enabled) then return jsonb_build_object('status','opt_out'); end if;
 for entry in select value from jsonb_array_elements(j.rule_snapshot) loop
  select * into r from public.rules where id=(entry->>'id')::uuid and user_id=j.user_id;
  if not found or not r.enabled or r.delivery_schedule->'active' is distinct from 'true'::jsonb or r.schedule_revision<>(entry->>'revision')::bigint then return jsonb_build_object('status','rule_changed'); end if;
  until_time:=greatest(until_time,public.s7_quiet_until(r.delivery_schedule->'quiet',r.timezone,now()));
 end loop;
 if exists(select 1 from public.digest_items i join public.occurrences o on o.id=i.occurrence_id join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
  where i.digest_id=j.digest_id and (s.terms_status<>'allowed' or not s.allow_cache or e.status<>'scheduled' or o.status<>'scheduled'
   or not coalesce(s.last_success_at>=now()-make_interval(secs=>s.freshness_seconds) and e.checked_at>=now()-make_interval(secs=>s.freshness_seconds),false)))
 then return jsonb_build_object('status','selection_unavailable'); end if;
 if until_time>now() then return jsonb_build_object('status','quiet','until',until_time); end if;
 return jsonb_build_object('status','allowed');
end $$;

create or replace function public.finish_s7_delivery(selected_delivery uuid,claim uuid,result text,ticket text default null,error text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare d public.deliveries;
begin
 if result not in ('accepted','retry','rejected','uncertain','fixture_recorded') or (result='accepted' and (ticket is null or length(ticket) not between 1 and 200)) or length(error)>100 then raise exception 'Invalid transport result'; end if;
 update public.deliveries set status=result,receipt_id=ticket,error_code=error,next_receipt_at=case when result='accepted' then now()+interval '15 minutes' else null end
 where id=selected_delivery and dispatch_token=claim and status='dispatching' returning * into d;
 if not found then return false; end if;
 if error='DeviceNotRegistered' then delete from public.device_tokens where id=d.device_token_id and user_id=d.user_id and updated_at<=d.dispatched_at; end if;
 return true;
end $$;
create or replace function public.finish_s7_receipt(selected_delivery uuid,result text,error text default null) returns boolean
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
 if error='DeviceNotRegistered' then delete from public.device_tokens where id=d.device_token_id and user_id=d.user_id and updated_at<=d.dispatched_at; end if;
 return true;
end $$;
