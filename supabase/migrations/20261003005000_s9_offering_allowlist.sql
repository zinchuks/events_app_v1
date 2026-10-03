-- Only configured subscription products may be offered for purchase. IDs are public, keys are not.
create or replace function public.s9_state() returns jsonb language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result jsonb;
begin
 if owner_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform public.s9_refresh_rules(owner_id);
 select jsonb_build_object('tier',public.s9_tier(owner_id),'limit',case when public.s9_tier(owner_id)='plus' then 10 else 1 end,
  'configured',(select enabled from public.s9_config),'sdk_products',(select to_jsonb(product_ids) from public.s9_config),'expires_at',e.expires_at,'grace_until',e.grace_until,'verified_at',e.verified_at,
  'active_rules',coalesce((select jsonb_agg(id order by id) from public.rules where user_id=owner_id and public.s9_rule_allowed(id)),'[]'),
  'free_eligible',coalesce((select jsonb_agg(id order by id) from public.rules r where user_id=owner_id and public.s9_free_eligible(r)),'[]'),
  'reconcile_pending',exists(select 1 from public.s9_reconcile_queue where user_id=owner_id and (due_at<=now() or lease_until>now())))
 into result from (select 1) seed left join public.entitlements e on e.user_id=owner_id;
 return result;
end $$;
