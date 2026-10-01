-- Select IDs, versions, rule settings and freshness in a single MVCC snapshot.
-- Concurrent rule edits cannot mix one selection with another rule fingerprint.
create or replace function public.build_rule_digest() returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ids uuid[]; identity text; result uuid; fresh boolean;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':s4-digest',0));
 select array_agg(o.id order by o.id),bool_and(coalesce(s.last_success_at>=now()-interval '48 hours',false)),
  's4:'||md5(coalesce(string_agg(o.id::text||':'||e.version||':'||coalesce(o.start_at::text,o.local_date::text,'unknown'),',' order by o.id),'')
  ||coalesce((select string_agg(r.id::text||r.name||r.filters::text||r.event_horizon::text||r.timezone,',' order by r.id) from public.rules r
   where r.user_id=caller and r.enabled and r.filters->>'scope'='s4'),'')
  ||coalesce((select string_agg(a.kind||coalesce(a.territory_id::text,'')||a.parameters::text,',' order by a.rule_id,a.kind,a.territory_id,a.parameters::text)
   from public.rule_areas a join public.rules r on r.id=a.rule_id where r.user_id=caller and r.enabled and r.filters->>'scope'='s4'),'')) into ids,fresh,identity
 from (select distinct occurrence_id from public.s4_matches()) m join public.occurrences o on o.id=m.occurrence_id
 join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id;
 if ids is null then return null; end if;
 if not fresh then raise exception 'Source data is stale'; end if;
 if cardinality(ids)>5000 then raise exception 'Narrow filters: selection exceeds 5000 events'; end if;
 insert into public.digests(user_id,business_key,rule_name) values(caller,identity,'S4') on conflict(user_id,business_key) do nothing returning id into result;
 if result is null then select id into result from public.digests where user_id=caller and business_key=identity; return result; end if;
 insert into public.digest_items(digest_id,user_id,occurrence_id) select result,caller,unnest(ids);
 return result;
end $$;
