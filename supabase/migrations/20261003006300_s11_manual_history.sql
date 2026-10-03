-- New manual selections capture rule names + full event facts in the same MVCC statement.
-- Version the business key; preserve old history whose original facts were never recorded.
CREATE OR REPLACE FUNCTION public.build_rule_digest()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare caller uuid:=auth.uid(); ids uuid[]; identity text; result uuid; fresh boolean; stale_count integer; selection jsonb;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':s4-digest',0));
 select array_agg(o.id order by o.id) filter(where f.current),bool_or(f.current),count(*) filter(where not f.current),
  's4:v2:'||md5(coalesce(string_agg(o.id::text||':'||e.version||':'||coalesce(o.start_at::text,o.local_date::text,'unknown'),',' order by o.id) filter(where f.current),'')
  ||coalesce((select string_agg(r.id::text||r.name||r.filters::text||r.event_horizon::text||r.timezone,',' order by r.id) from public.rules r
   where r.user_id=caller and r.enabled and r.filters->>'scope'='s4'),'')
  ||coalesce((select string_agg(a.kind||coalesce(a.territory_id::text,'')||a.parameters::text,',' order by a.rule_id,a.kind,a.territory_id,a.parameters::text)
   from public.rule_areas a join public.rules r on r.id=a.rule_id where r.user_id=caller and r.enabled and r.filters->>'scope'='s4'),''))  ,jsonb_object_agg(o.id::text,public.s8_snapshot(o.id)||jsonb_build_object('version',e.version,'rules',m.names)) filter(where f.current)
 into ids,fresh,stale_count,identity,selection
 from (select occurrence_id,array_agg(distinct r.name order by r.name) names from public.s4_matches() m join public.rules r on r.id=m.rule_id group by occurrence_id) m join public.occurrences o on o.id=m.occurrence_id
 join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
 cross join lateral(select coalesce(s.last_success_at>=now()-pg_catalog.make_interval(secs=>s.freshness_seconds) and e.checked_at>=now()-pg_catalog.make_interval(secs=>s.freshness_seconds),false) as current) f;
 if fresh is false then raise exception 'Source data is stale'; end if;
 if ids is null then return null; end if;
 if cardinality(ids)>5000 then raise exception 'Narrow filters: selection exceeds 5000 events'; end if;
 insert into public.digests(user_id,business_key,rule_name,stale_excluded) values(caller,identity,'S4',stale_count) on conflict(user_id,business_key) do nothing returning id into result;
 if result is null then select id into result from public.digests where user_id=caller and business_key=identity; return result; end if;
 insert into public.digest_items(digest_id,user_id,occurrence_id,matched_rule_names,selection_snapshot)
 select result,caller,x,array(select jsonb_array_elements_text(selection->x::text->'rules')),selection->x::text from unnest(ids) x;
 return result;
end $function$;

alter function public.build_rule_digest() set timezone='UTC';
