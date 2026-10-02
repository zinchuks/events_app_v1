-- New onboarding explicitly activates only when the user selects activation.
-- Preserve the legacy S5 inactive-preferences RPC for existing callers/tests.
create function public.save_s7_rule(rule_document jsonb,delivery_preferences jsonb,selected_rule uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 result:=public.save_s4_rule(rule_document,selected_rule);
 perform public.set_s7_delivery_preferences(result,delivery_preferences,rule_document->>'timezone');
 return result;
end $$;
revoke all on function public.save_s7_rule(jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_s7_rule(jsonb,jsonb,uuid) to authenticated;
