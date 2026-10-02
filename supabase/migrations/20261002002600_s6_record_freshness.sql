-- A successful partial poll does not refresh records absent from its batch.
-- Catalog/history remain readable; only new digest construction enforces record TTL.
create or replace function public.build_rule_digest() returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ids uuid[]; identity text; result uuid; fresh boolean;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':s4-digest',0));
 select array_agg(o.id order by o.id),bool_and(coalesce(s.last_success_at>=now()-make_interval(secs=>s.freshness_seconds)
  and e.checked_at>=now()-make_interval(secs=>s.freshness_seconds),false)),
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

create or replace function public.build_s3_digest(selected_rule uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); r public.rules; city uuid; today date; finish date;
 selected_ids uuid[]; fingerprint text; result uuid; use_expo boolean;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into r from public.rules where id=selected_rule and user_id=caller and enabled;
 if not found then raise exception 'Rule unavailable' using errcode='42501'; end if;
 if r.filters->>'scope' is distinct from 's3' or jsonb_typeof(r.filters->'categories') is distinct from 'array'
   or r.event_horizon is distinct from '{"days":30}'::jsonb or r.timezone<>'Europe/Madrid'
   or exists(select 1 from jsonb_array_elements_text(r.filters->'categories') c where not exists(select 1 from public.categories where code=c))
 then raise exception 'Unsupported S3 rule' using errcode='22023'; end if;
 select id into city from public.territories where external_id='madrid:municipio:Madrid' and not is_demo;
 if (select count(*) from public.rule_areas where rule_id=r.id and user_id=caller)<>1 or not exists(
   select 1 from public.rule_areas where rule_id=r.id and user_id=caller and kind='city' and territory_id=city
 ) then raise exception 'Unsupported S3 area' using errcode='22023'; end if;
 today := (now() at time zone 'Europe/Madrid')::date; finish:=today+30;
 -- Include versions and actual occurrence times in the immutable selection identity.
 select coalesce(array_agg(id order by event_day,id),array[]::uuid[]),
 md5(coalesce(string_agg(id::text||':'||version||':'||time_signature,',' order by event_day,id),''))
 into selected_ids,fingerprint from (
  select o.id,e.version,coalesce(o.local_date,(o.start_at at time zone 'Europe/Madrid')::date) event_day,
   coalesce(o.start_at::text,o.local_date::text,'unknown') time_signature
  from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
  where e.territory_id=city and not e.is_demo and not s.is_demo and s.terms_status='allowed'
   and s.url='https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information'
   and s.last_success_at>=now()-make_interval(secs=>s.freshness_seconds)
   and e.checked_at>=now()-make_interval(secs=>s.freshness_seconds) and e.status='scheduled' and o.status='scheduled'
   and ((o.time_kind='known' and o.start_at>=now() and (o.start_at at time zone 'Europe/Madrid')::date<finish)
    or (o.time_kind='date_only' and o.local_date>=today and o.local_date<finish))
   and (jsonb_array_length(r.filters->'categories')=0 or r.filters->'categories' ? e.category_code)
 ) items;
 fingerprint:='s3:'||r.id||':'||today||':'||md5((r.filters->'categories')::text)||':'||fingerprint;
 -- Advisory lock serializes two taps/retries for the same logical selection.
 perform pg_advisory_xact_lock(hashtextextended(caller::text||fingerprint,0));
 select id into result from public.digests where user_id=caller and business_key=fingerprint;
 if found then return result; end if;
 if cardinality(selected_ids)=0 then return null; end if;
 insert into public.digests(user_id,business_key,rule_id,rule_name,horizon_start,horizon_end)
 values(caller,fingerprint,r.id,r.name,today,finish) returning id into result;
 insert into public.digest_items(digest_id,user_id,occurrence_id) select result,caller,unnest(selected_ids);
 select push_enabled and exists(select 1 from public.device_tokens where user_id=caller) into use_expo from public.profiles where id=caller;
 insert into public.notification_jobs(user_id,business_key,run_at,digest_id,transport)
 values(caller,fingerprint,now(),result,case when use_expo then 'expo' else 'fixture' end);
 return result;
end $$;
