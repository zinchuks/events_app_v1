-- Provider-owned subscription snapshots. Default disabled: no store setup is assumed.
alter table public.entitlements add column verified_at timestamptz;
alter table public.entitlements add column provider_observed_at timestamptz;
alter table public.entitlements add column grace_until timestamptz;
alter table public.entitlements add column environment text check(environment in ('SANDBOX','PRODUCTION'));
create table public.s9_config(
 id boolean primary key default true check(id), enabled boolean not null default false,
 environment text not null default 'SANDBOX' check(environment in ('SANDBOX','PRODUCTION')),
 entitlement_id text, product_ids text[] not null default '{}', app_ids text[] not null default '{}',
 check(not enabled or (length(entitlement_id)>0 and cardinality(product_ids)>0 and cardinality(app_ids)>0))
);
insert into public.s9_config(id) values(true);
create table public.s9_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 free_rule uuid references public.rules(id) on delete set null
);
create table public.s9_webhook_events(
 event_id text not null check(length(event_id) between 1 and 200),
 user_id uuid not null references public.profiles(id) on delete cascade,
 received_at timestamptz not null default now(), primary key(event_id,user_id)
);
create table public.s9_reconcile_queue(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 generation bigint not null default 1, claim_generation bigint,
 due_at timestamptz not null default now(), lease_until timestamptz, claim uuid,
 requested_at timestamptz not null default now(), attempts integer not null default 0,
 error_code text
);
do $$ declare t text; begin
 foreach t in array array['s9_config','s9_preferences','s9_webhook_events','s9_reconcile_queue'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.s9_tier(owner_id uuid) returns text language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.entitlements e cross join public.s9_config c
  where e.user_id=owner_id and c.enabled and e.environment=c.environment and e.verified_at is not null
  and e.provider_reference='revenuecat' and e.tier='plus'
  and greatest(e.expires_at,e.grace_until)>now()) then 'plus' else 'free' end
$$;
create function public.s9_free_eligible(r public.rules) returns boolean language sql stable security definer set search_path='' as $$
 select r.filters->>'scope'='s4'
  and coalesce(jsonb_array_length(r.filters->'languages'),0)=0
  and r.filters->>'price_min' is null and r.filters->>'price_max' is null and r.filters->>'currency' is null
  and r.filters->>'age_min' is null and r.filters->>'age_max' is null
  and exists(select 1 from public.rule_areas a where a.rule_id=r.id)
  and not exists(select 1 from public.rule_areas a where a.rule_id=r.id and a.kind not in ('city','radius'))
  and (r.delivery_schedule->'active' is distinct from 'true'::jsonb
   or (r.delivery_schedule->>'mode'='weekdays' and jsonb_array_length(r.delivery_schedule->'weekdays')=1
    and r.delivery_schedule->'repeat_unchanged' is distinct from 'true'::jsonb))
$$;
create function public.s9_rule_allowed(selected_rule uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select r.enabled and r.filters->>'scope'='s4' and r.id in (
  select x.id from public.rules x where x.user_id=r.user_id and x.enabled and x.filters->>'scope'='s4'
   and (public.s9_tier(r.user_id)='plus' or public.s9_free_eligible(x))
  order by (x.id=(select free_rule from public.s9_preferences where user_id=r.user_id)) desc nulls last,x.id
  limit case when public.s9_tier(r.user_id)='plus' then 10 else 1 end
 ) from public.rules r where r.id=selected_rule),false)
$$;
alter table public.rules add column billing_paused boolean not null default false;
-- Legacy direct writes cannot forge this server column, ownership or S7 scheduling fences.
revoke insert,update on public.rules from authenticated;
grant insert(user_id,name,enabled,filters,event_horizon,timezone,delivery_schedule),
 update(name,enabled,filters,event_horizon,timezone,delivery_schedule) on public.rules to authenticated;
create function public.s9_refresh_rules(owner_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':rules',0));
 update public.rules r set billing_paused=not public.s9_rule_allowed(r.id),next_run_at=null
 where r.user_id=owner_id and r.billing_paused is distinct from (not public.s9_rule_allowed(r.id));
 -- validate_s5_delivery may have recomputed dates; paused rules have no automatic due slot.
 update public.rules set next_run_at=null where user_id=owner_id and billing_paused and next_run_at is not null;
end $$;
create function public.s9_state() returns jsonb language plpgsql security definer set search_path='' as $$
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
create function public.choose_s9_free_rule(selected_rule uuid) returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':rules',0));
 if not exists(select 1 from public.rules r where id=selected_rule and user_id=owner_id and public.s9_free_eligible(r)) then
  raise exception 'Choose a city/radius rule without Plus filters and with a weekly or inactive schedule' using errcode='22023'; end if;
 insert into public.s9_preferences(user_id,free_rule) values(owner_id,selected_rule)
 on conflict(user_id) do update set free_rule=excluded.free_rule;
 update public.rules set enabled=true where id=selected_rule;
 perform public.s9_refresh_rules(owner_id);
end $$;

create function public.enqueue_s9_reconcile(owner_id uuid,event_key text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where id=owner_id) then return false; end if;
 if event_key is not null then
  insert into public.s9_webhook_events(event_id,user_id) values(event_key,owner_id) on conflict do nothing;
  if not found then return false; end if;
 end if;
 insert into public.s9_reconcile_queue(user_id) values(owner_id)
 on conflict(user_id) do update set generation=public.s9_reconcile_queue.generation+1,
  due_at=now(),requested_at=now(),error_code=null;
 return true;
end $$;
create function public.request_s9_reconcile() returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid();
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from public.s9_config where enabled) then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text||':billing-request',0));
 if exists(select 1 from public.s9_reconcile_queue where user_id=owner_id and requested_at>now()-interval '1 minute') then return true; end if;
 return public.enqueue_s9_reconcile(owner_id);
end $$;
create function public.claim_s9_reconcile() returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.s9_reconcile_queue; nonce uuid:=gen_random_uuid();
begin
 if not exists(select 1 from public.s9_config where enabled) then return jsonb_build_object('status','disabled'); end if;
 select * into q from public.s9_reconcile_queue where due_at<=now() and (lease_until is null or lease_until<now()) order by due_at,user_id for update skip locked limit 1;
 if not found then return jsonb_build_object('status','idle'); end if;
 update public.s9_reconcile_queue set claim=nonce,claim_generation=generation,lease_until=now()+interval '2 minutes',attempts=attempts+1 where user_id=q.user_id;
 return jsonb_build_object('status','claimed','owner_id',q.user_id,'claim',nonce);
end $$;
create function public.finish_s9_reconcile(owner_id uuid,nonce uuid,snapshot jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare q public.s9_reconcile_queue; observed timestamptz; expiry timestamptz; grace timestamptz; env text;
begin
 select * into q from public.s9_reconcile_queue where user_id=owner_id and claim=nonce and lease_until>now() for update;
 if not found then return false; end if;
 select environment into env from public.s9_config where enabled;
 if env is null then return false; end if;
 observed:=(snapshot->>'observed_at')::timestamptz;expiry:=(snapshot->>'expires_at')::timestamptz;grace:=(snapshot->>'grace_until')::timestamptz;
 if snapshot->>'tier' not in ('free','plus') or observed is null or observed>now()+interval '1 minute'
  or observed<now()-interval '10 minutes' or (snapshot->>'tier'='plus' and expiry is null)
  or snapshot->>'environment' is distinct from env then raise exception 'Invalid verified provider snapshot'; end if;
 insert into public.entitlements(user_id,tier,expires_at,grace_until,verified_at,provider_observed_at,environment,provider_reference)
 values(owner_id,snapshot->>'tier',expiry,grace,now(),observed,env,'revenuecat')
 on conflict(user_id) do update set tier=excluded.tier,expires_at=excluded.expires_at,grace_until=excluded.grace_until,
  verified_at=excluded.verified_at,provider_observed_at=excluded.provider_observed_at,environment=excluded.environment,provider_reference=excluded.provider_reference
 where public.entitlements.provider_observed_at is null or public.entitlements.provider_observed_at<excluded.provider_observed_at;
 update public.s9_reconcile_queue set due_at=case when generation<>claim_generation then now() else now()+interval '6 hours' end,
  lease_until=null,claim=null,error_code=null,attempts=0 where user_id=owner_id;
 perform public.s9_refresh_rules(owner_id);
 return true;
end $$;
create function public.fail_s9_reconcile(owner_id uuid,nonce uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.s9_reconcile_queue set due_at=now()+interval '5 minutes',lease_until=null,claim=null,error_code='provider_unavailable'
 where user_id=owner_id and claim=nonce and lease_until>now();return found;
end $$;
-- Explicit ACL: no default PUBLIC EXECUTE on any provider/other-owner helper.
do $$ declare fn regprocedure; begin
 for fn in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in
 ('s9_tier','s9_free_eligible','s9_rule_allowed','s9_refresh_rules','s9_state','choose_s9_free_rule','enqueue_s9_reconcile','request_s9_reconcile','claim_s9_reconcile','finish_s9_reconcile','fail_s9_reconcile') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn);
  execute format('grant execute on function %s to service_role',fn);
 end loop;
end $$;
grant execute on function public.s9_state(),public.choose_s9_free_rule(uuid),public.request_s9_reconcile() to authenticated;
