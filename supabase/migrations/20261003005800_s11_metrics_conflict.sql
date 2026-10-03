-- Explicit constraint avoids collision with the RPC kind parameter.
create or replace function public.record_s11_metric(kind text) returns boolean language plpgsql security definer set search_path='' as $$
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
 on conflict on constraint s11_metrics_pkey do update set count=least(public.s11_metrics.count+1,1000);
 return true;
end $$;
