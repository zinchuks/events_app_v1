-- Reject non-string names/timezones rather than stringify arbitrary JSON.
create or replace function public.save_s4_rule(rule_document jsonb, selected_rule uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); result uuid; area jsonb; k text;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':rules',0));
 if jsonb_typeof(rule_document) is distinct from 'object' or jsonb_typeof(rule_document->'name') is distinct from 'string'
  or jsonb_typeof(rule_document->'timezone') is distinct from 'string' or rule_document->'filters'->>'scope' is distinct from 's4'
  or jsonb_typeof(rule_document->'areas') is distinct from 'array' or jsonb_array_length(rule_document->'areas') not between 1 and 20
  or jsonb_typeof(rule_document->'enabled') is distinct from 'boolean' then raise exception 'Invalid rule document'; end if;
 for k in select jsonb_object_keys(rule_document) loop
  if k not in ('name','enabled','filters','event_horizon','timezone','areas') then raise exception 'Unknown rule property'; end if;
 end loop;
 if selected_rule is not null then
  select id into result from public.rules where id=selected_rule and user_id=caller and filters->>'scope'='s4' for update;
  if result is null then raise exception 'Rule not found' using errcode='42501'; end if;
  update public.rules set name=rule_document->>'name',enabled=(rule_document->>'enabled')::boolean,filters=rule_document->'filters',
   event_horizon=rule_document->'event_horizon',timezone=rule_document->>'timezone',next_run_at=null where id=result;
  delete from public.rule_areas where rule_id=result;
 else
  if (select count(*) from public.rules where user_id=caller and filters->>'scope'='s4')>=20 then raise exception 'Rule limit is 20'; end if;
  insert into public.rules(user_id,name,enabled,filters,event_horizon,timezone) values(caller,rule_document->>'name',(rule_document->>'enabled')::boolean,
   rule_document->'filters',rule_document->'event_horizon',rule_document->>'timezone') returning id into result;
 end if;
 for area in select value from jsonb_array_elements(rule_document->'areas') loop
  if jsonb_typeof(area)<>'object' or exists(select 1 from jsonb_object_keys(area) key where key not in ('kind','territory_id','parameters')) then raise exception 'Invalid area document'; end if;
  insert into public.rule_areas(rule_id,user_id,kind,territory_id,parameters) values(result,caller,area->>'kind',(area->>'territory_id')::uuid,coalesce(area->'parameters','{}'));
 end loop;
 return result;
end $$;
