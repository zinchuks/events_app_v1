-- Durable owner updates and reminders. Source absence never changes explicit status.
create table public.s8_state (
 occurrence_id uuid primary key references public.occurrences(id) on delete cascade,
 revision bigint not null default 1, snapshot jsonb not null
);
create table public.s8_corrections (
 occurrence_id uuid primary key references public.occurrences(id) on delete cascade,
 patch jsonb not null, reason text not null, updated_at timestamptz not null default now()
);
create table public.s8_correction_log (
 id uuid primary key default gen_random_uuid(), occurrence_id uuid references public.occurrences(id) on delete set null,
 patch jsonb not null, reason text not null, created_at timestamptz not null default now()
);
create table public.s8_alerts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 occurrence_id uuid not null references public.occurrences(id) on delete cascade,
 kind text not null check(kind in ('changed','cancelled','reminder')),
 revision bigint not null, preference_revision bigint not null default 0,
 lead_minutes integer, business_key text not null unique,
 before_snapshot jsonb, snapshot jsonb not null,
 run_at timestamptz not null, expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','published','superseded','expired')),
 digest_id uuid, created_at timestamptz not null default now(),
 unique(id,user_id), foreign key(digest_id,user_id) references public.digests(id,user_id) on delete cascade
);
create index s8_alerts_due on public.s8_alerts(run_at) where status='pending';
create index s8_alerts_owner on public.s8_alerts(user_id,occurrence_id,created_at desc);
alter table public.saved_events add column reminder_minutes integer[] not null default '{}';
alter table public.saved_events add column reminder_revision bigint not null default 0;
alter table public.saved_events add column updates_enabled boolean not null default true;
alter table public.saved_events add column reminder_timezone text not null default 'UTC' check(public.valid_timezone(reminder_timezone));
alter table public.saved_events add column reminder_quiet jsonb;
-- Owner insert/delete contract preserved, server-owned preference fields protected.
revoke insert,update on public.saved_events from authenticated;
grant update(user_id,occurrence_id) on public.saved_events to authenticated;
grant insert(user_id,occurrence_id) on public.saved_events to authenticated;
alter table public.notification_jobs add column s8_alert_id uuid;
alter table public.notification_jobs add constraint s8_job_owner foreign key(s8_alert_id,user_id) references public.s8_alerts(id,user_id) on delete cascade;
do $$ declare t text; begin
 foreach t in array array['s8_state','s8_corrections','s8_correction_log','s8_alerts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;
grant select on public.s8_alerts to authenticated;
create policy s8_owner on public.s8_alerts for select to authenticated using((select auth.uid())=user_id);

create function public.s8_snapshot(selected_occurrence uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',e.title,'venue',e.venue,'price',e.price,'currency',e.currency,
 'url',e.canonical_url,'location',e.location::text,'category',e.category_code,'language',e.event_language,
 'time_kind',o.time_kind,'start_at',o.start_at,'end_at',o.end_at,'local_date',o.local_date,'timezone',o.timezone,
 'status',case when e.status='cancelled' or o.status='cancelled' then 'cancelled' when e.status='review' or o.status='review' then 'unknown' else 'scheduled' end)
 from public.occurrences o join public.events e on e.id=o.event_id where o.id=selected_occurrence
$$;
insert into public.s8_state(occurrence_id,snapshot) select id,public.s8_snapshot(id) from public.occurrences;

create function public.s8_sync_reminders(selected_owner uuid,selected_occurrence uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.s8_state; v public.saved_events; lead integer; due timestamptz;
begin
 select * into s from public.s8_state where occurrence_id=selected_occurrence for update;
 select * into v from public.saved_events where user_id=selected_owner and occurrence_id=selected_occurrence;
 update public.s8_alerts set status='superseded' where user_id=selected_owner and occurrence_id=selected_occurrence and kind='reminder' and status='pending'
  and (not found or revision<>s.revision or preference_revision<>v.reminder_revision or s.snapshot->>'status'<>'scheduled' or s.snapshot->>'time_kind'<>'known');
 if v.user_id is null or s.snapshot->>'status'<>'scheduled' or s.snapshot->>'time_kind'<>'known' then return; end if;
 foreach lead in array v.reminder_minutes loop
  due:=(s.snapshot->>'start_at')::timestamptz-make_interval(mins=>lead);
  if due<=now() then continue; end if; -- Never send already-past lead slots after save/edit.
  insert into public.s8_alerts(user_id,occurrence_id,kind,revision,preference_revision,lead_minutes,business_key,snapshot,run_at,expires_at)
  values(v.user_id,selected_occurrence,'reminder',s.revision,v.reminder_revision,lead,
   's8:r:'||v.user_id||':'||selected_occurrence||':'||s.revision||':'||v.reminder_revision||':'||lead,s.snapshot,due,(s.snapshot->>'start_at')::timestamptz)
  on conflict(business_key) do nothing;
 end loop;
end $$;

create function public.s8_collect(selected_occurrence uuid) returns void
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
   insert into public.s8_alerts(user_id,occurrence_id,kind,revision,business_key,before_snapshot,snapshot,run_at,expires_at)
   values(v.user_id,selected_occurrence,case when current_snapshot->>'status'='cancelled' and s.snapshot->>'status'<>'cancelled' then 'cancelled' else 'changed' end,
    revision_number,'s8:c:'||v.user_id||':'||selected_occurrence||':'||revision_number,s.snapshot,current_snapshot,now(),now()+interval '24 hours')
   on conflict(business_key) do nothing;
  end if;
  perform public.s8_sync_reminders(v.user_id,selected_occurrence);
 end loop;
end $$;
create function public.s8_collect_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare occurrence uuid;
begin
 if tg_table_name='events' then
  for occurrence in select id from public.occurrences where event_id=new.id order by id loop perform public.s8_collect(occurrence); end loop;
 else perform public.s8_collect(new.id); end if;
 return null;
end $$;
-- Deferral observes the FINAL event+occurrence state, producing one logical update per transaction.
create constraint trigger s8_event_change after insert or update on public.events deferrable initially deferred for each row execute function public.s8_collect_trigger();
create constraint trigger s8_occurrence_change after insert or update on public.occurrences deferrable initially deferred for each row execute function public.s8_collect_trigger();
create function public.s8_saved_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' then
  update public.s8_alerts set status='superseded' where user_id=old.user_id and occurrence_id=old.occurrence_id and status='pending';
 else perform public.s8_collect(new.occurrence_id); perform public.s8_sync_reminders(new.user_id,new.occurrence_id); end if;
 return null;
end $$;
create trigger s8_saved after insert or update or delete on public.saved_events for each row execute function public.s8_saved_trigger();

create function public.set_s8_saved_preferences(selected_occurrence uuid,leads integer[],updates boolean,zone text,quiet jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if leads is null or cardinality(leads)>3 or exists(select 1 from unnest(leads) x where x is null or x not between 5 and 10080)
  or cardinality(leads)<>(select count(distinct x) from unnest(leads) x) or updates is null or not public.valid_timezone(zone) or zone is null
  or (quiet is not null and (jsonb_typeof(quiet)<>'object' or quiet->>'start' is null or quiet->>'end' is null or
   quiet->>'start'!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or quiet->>'end'!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or quiet->>'start'=quiet->>'end' or quiet-array['start','end']<>'{}'::jsonb))
 then raise exception 'Invalid saved preferences' using errcode='22023'; end if;
 perform 1 from public.s8_state where occurrence_id=selected_occurrence for update;
 update public.saved_events set reminder_minutes=array(select x from unnest(leads) x order by x),updates_enabled=updates,
  reminder_timezone=zone,reminder_quiet=quiet,reminder_revision=reminder_revision+1
 where user_id=caller and occurrence_id=selected_occurrence
 and (reminder_minutes is distinct from array(select x from unnest(leads) x order by x) or updates_enabled is distinct from updates or reminder_timezone is distinct from zone or reminder_quiet is distinct from quiet);
 if not exists(select 1 from public.saved_events where user_id=caller and occurrence_id=selected_occurrence) then raise exception 'Saved event not found' using errcode='42501'; end if;
end $$;

create function public.s8_availability(selected_occurrence uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when e.status='cancelled' or o.status='cancelled' then 'cancelled'
 when e.status='review' or o.status='review' or o.time_kind='unknown' then 'unknown'
 when not coalesce(s.last_success_at>=now()-make_interval(secs=>s.freshness_seconds) and e.checked_at>=now()-make_interval(secs=>s.freshness_seconds),false) then 'outdated'
 else 'scheduled' end from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
 where o.id=selected_occurrence and s.terms_status='allowed' and s.allow_cache and not e.is_demo and not s.is_demo
$$;

create function public.run_s8_scheduler() returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.s8_alerts; d uuid; v public.saved_events; available text;
begin
 select * into a from public.s8_alerts where status='pending' and run_at<=now() order by run_at,id for update skip locked limit 1;
 if not found then return jsonb_build_object('status','idle'); end if;
 select * into v from public.saved_events where user_id=a.user_id and occurrence_id=a.occurrence_id;
 available:=public.s8_availability(a.occurrence_id);
 if v.user_id is null or (a.kind='reminder' and (available in ('cancelled','unknown') or not exists(select 1 from public.s8_state where occurrence_id=a.occurrence_id and revision=a.revision) or v.reminder_revision<>a.preference_revision)) then
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

-- Reuse the proven S7 transport fences/receipts; S8 policy allows explicit cancellation.
alter function public.s7_push_allowed(public.notification_jobs) rename to s7_digest_push_allowed;
create function public.s7_push_allowed(j public.notification_jobs) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare a public.s8_alerts; v public.saved_events; until_time timestamptz; available text;
begin
 if j.s8_alert_id is null then return public.s7_digest_push_allowed(j); end if;
 select * into a from public.s8_alerts where id=j.s8_alert_id and user_id=j.user_id;
 if a.id is null or a.status<>'published' or j.expires_at<=now() then return jsonb_build_object('status','expired'); end if;
 if not exists(select 1 from public.profiles where id=j.user_id and push_enabled) then return jsonb_build_object('status','opt_out'); end if;
 select * into v from public.saved_events where user_id=j.user_id and occurrence_id=a.occurrence_id;
 if v.user_id is null or (a.kind='changed' and not v.updates_enabled) then return jsonb_build_object('status','unsaved_or_paused'); end if;
 available:=public.s8_availability(a.occurrence_id);
 if available is null or available='outdated' then return jsonb_build_object('status','selection_unavailable'); end if;
 if a.kind='reminder' and (available<>'scheduled' or v.reminder_revision<>a.preference_revision or not exists(select 1 from public.s8_state where occurrence_id=a.occurrence_id and revision=a.revision)) then return jsonb_build_object('status','event_changed'); end if;
 if a.kind='cancelled' and available<>'cancelled' then return jsonb_build_object('status','event_changed'); end if;
 until_time:=public.s7_quiet_until(v.reminder_quiet,v.reminder_timezone,now());
 if until_time>now() then return jsonb_build_object('status','quiet','until',until_time); end if;
 return jsonb_build_object('status','allowed');
end $$;

-- No admin UI/roles before S10: explicit server-only, audited correction API.
create function public.correct_s8_occurrence(selected_occurrence uuid,patch jsonb,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare e uuid; allowed text[]:=array['title','venue','price','currency','status','time_kind','start_at','end_at','local_date','timezone'];
begin
 if jsonb_typeof(patch) is distinct from 'object' or patch-allowed<>'{}'::jsonb or length(patch::text)>2000
 or (patch?'title' and (patch->>'title' is null or length(trim(patch->>'title')) not between 1 and 400))
 or (patch?'venue' and length(patch->>'venue')>400)
 or (patch?'status' and coalesce(patch->>'status','') not in ('scheduled','cancelled','review'))
 or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Invalid correction'; end if;
 select event_id into e from public.occurrences where id=selected_occurrence for update;
 if e is null then raise exception 'Unknown occurrence'; end if;
 insert into public.s8_corrections(occurrence_id,patch,reason) values(selected_occurrence,patch,reason)
 on conflict(occurrence_id) do update set patch=excluded.patch,reason=excluded.reason,updated_at=now();
 insert into public.s8_correction_log(occurrence_id,patch,reason) values(selected_occurrence,patch,reason);
 update public.events set title=case when patch?'title' then patch->>'title' else title end,
 venue=case when patch?'venue' then patch->>'venue' else venue end,
 price=case when patch?'price' then (patch->>'price')::numeric else price end,currency=case when patch?'currency' then patch->>'currency' else currency end,
 status=case when patch?'status' then patch->>'status' else status end,version=version+1 where id=e;
 update public.occurrences set time_kind=case when patch?'time_kind' then patch->>'time_kind' else time_kind end,
 start_at=case when patch?'start_at' then (patch->>'start_at')::timestamptz else start_at end,
 end_at=case when patch?'end_at' then (patch->>'end_at')::timestamptz else end_at end,
 local_date=case when patch?'local_date' then (patch->>'local_date')::date else local_date end,
 timezone=case when patch?'timezone' then patch->>'timezone' else timezone end,
 status=case when patch?'status' then patch->>'status' else status end where id=selected_occurrence;
end $$;
do $$ declare signature text; begin
 foreach signature in array array['s8_snapshot(uuid)','s8_sync_reminders(uuid,uuid)','s8_collect(uuid)','s8_collect_trigger()','s8_saved_trigger()',
 'run_s8_scheduler()','s7_digest_push_allowed(public.notification_jobs)','s7_push_allowed(public.notification_jobs)','correct_s8_occurrence(uuid,jsonb,text)'] loop
  execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
  execute 'grant execute on function public.'||signature||' to service_role';
 end loop;
end $$;
revoke all on function public.set_s8_saved_preferences(uuid,integer[],boolean,text,jsonb) from public,anon;
grant execute on function public.set_s8_saved_preferences(uuid,integer[],boolean,text,jsonb) to authenticated;
revoke all on function public.s8_availability(uuid) from public;
grant execute on function public.s8_availability(uuid) to anon,authenticated,service_role;
