-- Pause pending ordinary updates; explicit saved cancellation remains free and active.
create or replace function public.run_s8_scheduler() returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.s8_alerts; d uuid; v public.saved_events; available text;
begin
 select * into a from public.s8_alerts where status='pending' and run_at<=now() order by run_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('status','idle'); end if;
 select * into v from public.saved_events where user_id=a.user_id and occurrence_id=a.occurrence_id;
 available:=public.s8_availability(a.occurrence_id);
 if v.user_id is null or (a.kind='changed' and not v.updates_enabled) or (a.kind='reminder' and (available in ('cancelled','unknown') or not exists(select 1 from public.s8_state where occurrence_id=a.occurrence_id and revision=a.revision) or v.reminder_revision<>a.preference_revision)) then
  update public.s8_alerts set status='superseded' where id=a.id; return jsonb_build_object('status','superseded');
 end if;
 if a.expires_at<=now() then update public.s8_alerts set status='expired' where id=a.id; return jsonb_build_object('status','expired'); end if;
 if available is null or available='outdated' then
  update public.s8_alerts set run_at=now()+interval '5 minutes' where id=a.id; return jsonb_build_object('status','stale');
 end if;
 insert into public.digests(user_id,business_key,rule_name) values(a.user_id,a.business_key,'S8:'||a.kind) returning id into d;
 insert into public.digest_items(digest_id,user_id,occurrence_id,selection_snapshot)
 values(d,a.user_id,a.occurrence_id,a.snapshot||jsonb_build_object('alert_kind',a.kind,'before',a.before_snapshot,'lead_minutes',a.lead_minutes));
 insert into public.notification_jobs(user_id,business_key,run_at,digest_id,transport,workflow,rule_snapshot,expires_at,s8_alert_id)
 values(a.user_id,a.business_key,now(),d,'expo','s7','[]',a.expires_at,a.id);
 update public.s8_alerts set status='published',digest_id=d where id=a.id;
 return jsonb_build_object('status','published','kind',a.kind);
end $$;

create function public.s8_manual_correction(selected_occurrence uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.s8_availability(selected_occurrence) is not null and exists(select 1 from public.s8_corrections where occurrence_id=selected_occurrence)
$$;
revoke all on function public.s8_manual_correction(uuid) from public;
grant execute on function public.s8_manual_correction(uuid) to anon,authenticated,service_role;
