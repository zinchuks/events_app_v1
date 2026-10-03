-- A re-save is a new subscription instance, not a reused revision-0 row.
alter table public.saved_events add column reminder_epoch uuid not null default gen_random_uuid();
alter table public.s8_alerts add column saved_epoch uuid;
update public.s8_alerts a set saved_epoch=coalesce((select v.reminder_epoch from public.saved_events v where v.user_id=a.user_id and v.occurrence_id=a.occurrence_id),gen_random_uuid());
alter table public.s8_alerts alter column saved_epoch set not null;
update public.digests d set business_key=a.business_key||':'||a.saved_epoch from public.s8_alerts a where a.kind='reminder' and a.digest_id=d.id and a.user_id=d.user_id;
update public.notification_jobs j set business_key=a.business_key||':'||a.saved_epoch from public.s8_alerts a where a.kind='reminder' and j.s8_alert_id=a.id and j.user_id=a.user_id;
update public.s8_alerts set business_key=business_key||':'||saved_epoch where kind='reminder';

create or replace function public.s8_sync_reminders(selected_owner uuid,selected_occurrence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.s8_state; v public.saved_events; lead integer; due timestamptz;
begin
 select * into s from public.s8_state where occurrence_id=selected_occurrence for update;
 select * into v from public.saved_events where user_id=selected_owner and occurrence_id=selected_occurrence;
 update public.s8_alerts set status='superseded' where user_id=selected_owner and occurrence_id=selected_occurrence and kind='reminder' and status='pending'
  and (not found or saved_epoch is distinct from v.reminder_epoch or revision<>s.revision or preference_revision<>v.reminder_revision or s.snapshot->>'status'<>'scheduled' or s.snapshot->>'time_kind'<>'known');
 if v.user_id is null or s.snapshot->>'status'<>'scheduled' or s.snapshot->>'time_kind'<>'known' then return; end if;
 foreach lead in array v.reminder_minutes loop
  due:=(s.snapshot->>'start_at')::timestamptz-make_interval(mins=>lead);
  if due<=now() then continue; end if; -- Never send already-past lead slots after save/edit.
  insert into public.s8_alerts(user_id,occurrence_id,kind,revision,preference_revision,lead_minutes,business_key,snapshot,run_at,expires_at,saved_epoch)
  values(v.user_id,selected_occurrence,'reminder',s.revision,v.reminder_revision,lead,
   's8:r:'||v.user_id||':'||selected_occurrence||':'||s.revision||':'||v.reminder_revision||':'||lead||':'||v.reminder_epoch,s.snapshot,due,(s.snapshot->>'start_at')::timestamptz,v.reminder_epoch)
  on conflict(business_key) do nothing;
 end loop;
end $$;

create or replace function public.s8_collect(selected_occurrence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.s8_state; current_snapshot jsonb; v public.saved_events; revision_number bigint;
begin
 -- Row lock serializes import/correction/reminder edits for one occurrence.
 current_snapshot:=public.s8_snapshot(selected_occurrence);
 if current_snapshot is null then return; end if;
 insert into public.s8_state(occurrence_id,snapshot) values(selected_occurrence,current_snapshot) on conflict do nothing;
 select * into s from public.s8_state where occurrence_id=selected_occurrence for update;
 if s.snapshot=current_snapshot then return; end if;
 revision_number:=s.revision+1;
 update public.s8_state set revision=revision_number,snapshot=current_snapshot where occurrence_id=selected_occurrence;
 for v in select * from public.saved_events where occurrence_id=selected_occurrence order by user_id loop
  if v.updates_enabled or (current_snapshot->>'status'='cancelled' and s.snapshot->>'status'<>'cancelled') then
   insert into public.s8_alerts(user_id,occurrence_id,kind,revision,business_key,before_snapshot,snapshot,run_at,expires_at,saved_epoch)
   values(v.user_id,selected_occurrence,case when current_snapshot->>'status'='cancelled' and s.snapshot->>'status'<>'cancelled' then 'cancelled' else 'changed' end,
    revision_number,'s8:c:'||v.user_id||':'||selected_occurrence||':'||revision_number,s.snapshot,current_snapshot,now(),now()+interval '24 hours',v.reminder_epoch)
   on conflict(business_key) do nothing;
  end if;
  perform public.s8_sync_reminders(v.user_id,selected_occurrence);
 end loop;
end $$;

create or replace function public.s7_push_allowed(j public.notification_jobs) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.s8_alerts; v public.saved_events; until_time timestamptz; available text;
begin
 if j.s8_alert_id is null then return public.s7_digest_push_allowed(j); end if;
 select * into a from public.s8_alerts where id=j.s8_alert_id and user_id=j.user_id;
 if a.id is null or a.status<>'published' or j.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if not exists(select 1 from public.profiles where id=j.user_id and push_enabled) then return jsonb_build_object('status','opt_out'); end if;
 select * into v from public.saved_events where user_id=j.user_id and occurrence_id=a.occurrence_id;
 if v.user_id is null or v.reminder_epoch is distinct from a.saved_epoch or (a.kind='changed' and not v.updates_enabled) then return jsonb_build_object('status','unsaved_or_paused'); end if;
 available:=public.s8_availability(a.occurrence_id);
 if available is null or available='outdated' then return jsonb_build_object('status','selection_unavailable'); end if;
 if a.kind='reminder' and (available<>'scheduled' or v.reminder_revision<>a.preference_revision or not exists(select 1 from public.s8_state where occurrence_id=a.occurrence_id and revision=a.revision)) then return jsonb_build_object('status','event_changed'); end if;
 if a.kind='cancelled' and available<>'cancelled' then return jsonb_build_object('status','event_changed'); end if;
 until_time:=public.s7_quiet_until(v.reminder_quiet,v.reminder_timezone,now());
 if until_time>now() then return jsonb_build_object('status','quiet','until',until_time); end if;
 return jsonb_build_object('status','allowed');
end $$;

create or replace function public.run_s8_scheduler() returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.s8_alerts; d uuid; v public.saved_events; available text;
begin
 select * into a from public.s8_alerts where status='pending' and run_at<=now() order by run_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('status','idle'); end if;
 select * into v from public.saved_events where user_id=a.user_id and occurrence_id=a.occurrence_id;
 available:=public.s8_availability(a.occurrence_id);
 if v.user_id is null or v.reminder_epoch is distinct from a.saved_epoch or (a.kind='changed' and not v.updates_enabled) or (a.kind='reminder' and (available in ('cancelled','unknown') or not exists(select 1 from public.s8_state where occurrence_id=a.occurrence_id and revision=a.revision) or v.reminder_revision<>a.preference_revision)) then
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
