-- Opt-in daily counters, not an activity stream. No IDs of events/rules, URLs or free text.
create table public.s11_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 metrics_enabled boolean not null default false
);
create table public.s11_metrics (
 user_id uuid not null references public.s11_preferences(user_id) on delete cascade,
 day date not null,
 kind text not null check(kind in ('rule_created','digest_opened','event_saved','organizer_opened','purchase')),
 count integer not null check(count between 1 and 1000),
 primary key(user_id,day,kind)
);
alter table public.s11_preferences enable row level security;
alter table public.s11_metrics enable row level security;
create policy own_s11_preferences on public.s11_preferences for select to authenticated using(user_id=auth.uid());
create policy own_s11_metrics on public.s11_metrics for select to authenticated using(user_id=auth.uid());
revoke all on public.s11_preferences,public.s11_metrics from public,anon,authenticated;
grant select on public.s11_preferences,public.s11_metrics to authenticated;
grant all on public.s11_preferences,public.s11_metrics to service_role;

create function public.s11_metrics_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select metrics_enabled from public.s11_preferences where user_id=auth.uid()),false)
$$;
create function public.set_s11_metrics(enabled boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid();
begin
 if owner is null or enabled is null then raise exception 'Authenticated explicit preference required' using errcode='22023'; end if;
 insert into public.s11_preferences(user_id,metrics_enabled) values(owner,enabled)
 on conflict(user_id) do update set metrics_enabled=excluded.metrics_enabled;
 -- Same row lock as recorder: an in-flight record cannot resurrect data after opt-out.
 if not enabled then delete from public.s11_metrics where user_id=owner; end if;
 return enabled;
end $$;
create function public.record_s11_metric(kind text) returns boolean language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); allowed boolean;
begin
 if owner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if kind is null or kind not in ('rule_created','digest_opened','event_saved','organizer_opened','purchase') then
  raise exception 'Unknown metric' using errcode='22023';
 end if;
 select metrics_enabled into allowed from public.s11_preferences where user_id=owner for update;
 if not coalesce(allowed,false) then return false; end if;
 delete from public.s11_metrics where user_id=owner and day<(now() at time zone 'UTC')::date-29;
 insert into public.s11_metrics(user_id,day,kind,count) values(owner,(now() at time zone 'UTC')::date,kind,1)
 on conflict(user_id,day,kind) do update set count=least(public.s11_metrics.count+1,1000);
 return true;
end $$;
-- Trusted maintenance must call this daily; reads independently exclude expired counters.
create function public.prune_s11_metrics() returns bigint language plpgsql security definer set search_path='' as $$
declare removed bigint;
begin
 delete from public.s11_metrics where day<(now() at time zone 'UTC')::date-29;
 get diagnostics removed=row_count; return removed;
end $$;
create function public.s11_metrics_report() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform public.s10_require('viewer');
 return coalesce((select jsonb_agg(to_jsonb(x) order by x.day,x.kind) from (
  select day,kind,sum(count) as count from public.s11_metrics
  where day>=(now() at time zone 'UTC')::date-29 group by day,kind
 ) x),'[]'::jsonb);
end $$;
revoke all on function public.s11_metrics_enabled(),public.set_s11_metrics(boolean),public.record_s11_metric(text),public.prune_s11_metrics(),public.s11_metrics_report() from public,anon,authenticated;
grant execute on function public.s11_metrics_enabled(),public.set_s11_metrics(boolean),public.record_s11_metric(text),public.s11_metrics_report() to authenticated;
grant execute on function public.prune_s11_metrics() to service_role;
