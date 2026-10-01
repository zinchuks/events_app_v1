-- S4 settings/areas may only be edited together through the validated RPC.
-- Keep S2/S3 legacy contracts and owner-readable/deletable rules intact.
drop policy owner_access on public.rules;
create policy owner_read on public.rules for select to authenticated using ((select auth.uid())=user_id);
create policy owner_delete on public.rules for delete to authenticated using ((select auth.uid())=user_id);
create policy legacy_insert on public.rules for insert to authenticated
 with check ((select auth.uid())=user_id and filters->>'scope' is distinct from 's4');
create policy legacy_update on public.rules for update to authenticated
 using ((select auth.uid())=user_id and filters->>'scope' is distinct from 's4')
 with check ((select auth.uid())=user_id and filters->>'scope' is distinct from 's4');

drop policy owner_access on public.rule_areas;
create policy owner_read on public.rule_areas for select to authenticated using ((select auth.uid())=user_id);
create policy legacy_write on public.rule_areas for all to authenticated
 using ((select auth.uid())=user_id and not exists(select 1 from public.rules r where r.id=rule_id and r.filters->>'scope'='s4'))
 with check ((select auth.uid())=user_id and not exists(select 1 from public.rules r where r.id=rule_id and r.filters->>'scope'='s4'));

create function public.set_s4_rule_enabled(selected_rule uuid,rule_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if rule_enabled is null then raise exception 'Enabled must be boolean'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':rules',0));
 update public.rules set enabled=rule_enabled,next_run_at=null where id=selected_rule and user_id=caller and filters->>'scope'='s4';
 if not found then raise exception 'Rule not found' using errcode='42501'; end if;
end $$;
revoke all on function public.set_s4_rule_enabled(uuid,boolean) from public,anon;
grant execute on function public.set_s4_rule_enabled(uuid,boolean) to authenticated;
