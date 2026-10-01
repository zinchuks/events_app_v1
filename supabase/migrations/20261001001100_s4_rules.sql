-- S4: validated private rule contracts, spatial matching and manual union digest.
alter table public.events add column age_min integer check (age_min between 0 and 120);
alter table public.events add column age_max integer check (age_max between 0 and 120);
alter table public.events add constraint event_age_range check (age_min is null or age_max is null or age_min<=age_max);
alter table public.rule_areas add column center extensions.geography(Point,4326);
alter table public.rule_areas add column radius_meters numeric;
alter table public.rule_areas add column polygon extensions.geometry(Polygon,4326);
create index rule_areas_polygon_idx on public.rule_areas using gist(polygon);

create function public.validate_s4_rule() returns trigger
language plpgsql set search_path='' as $$
declare f jsonb := new.filters; h jsonb := new.event_horizon; v jsonb; k text; lo numeric; hi numeric;
begin
 if f->>'scope' is distinct from 's4' then return new; end if;
 if length(trim(new.name)) not between 1 and 100 or not public.valid_timezone(new.timezone)
  or jsonb_typeof(f)<>'object' or jsonb_typeof(h)<>'object' then raise exception 'Invalid rule'; end if;
 for k in select jsonb_object_keys(f) loop
  if k not in ('scope','categories','languages','include_unknown_language','price_min','price_max','currency','include_unknown_price','age_min','age_max','include_unknown_age') then raise exception 'Unknown filter'; end if;
 end loop;
 if jsonb_typeof(f->'categories') is distinct from 'array' or jsonb_array_length(f->'categories')>50
  or jsonb_typeof(f->'languages') is distinct from 'array' or jsonb_array_length(f->'languages')>20 then raise exception 'Invalid category/language list'; end if;
 for v in select value from jsonb_array_elements(f->'categories') loop
  if jsonb_typeof(v)<>'string' or not exists(select 1 from public.categories where code=v#>>'{}') then raise exception 'Invalid category'; end if;
 end loop;
 for v in select value from jsonb_array_elements(f->'languages') loop
  if jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then raise exception 'Invalid event language'; end if;
 end loop;
 foreach k in array array['include_unknown_language','include_unknown_price','include_unknown_age'] loop
  if jsonb_typeof(f->k) is distinct from 'boolean' then raise exception 'Unknown-value policy required'; end if;
 end loop;
 foreach k in array array['price_min','price_max','age_min','age_max'] loop
  if f?k and f->k<>'null'::jsonb then
   if jsonb_typeof(f->k)<>'number' or (f->>k)::numeric<0 or (f->>k)::numeric>100000000 then raise exception 'Invalid numeric filter'; end if;
   if k like 'age_%' and ((f->>k)::numeric>120 or (f->>k)::numeric<>trunc((f->>k)::numeric)) then raise exception 'Invalid age'; end if;
  end if;
 end loop;
 lo:=(f->>'price_min')::numeric; hi:=(f->>'price_max')::numeric;
 if lo>hi then raise exception 'Reversed budget'; end if;
 if (lo is not null or hi is not null) and coalesce(f->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Explicit currency required'; end if;
 if f->>'currency' is not null and (f->>'currency') !~ '^[A-Z]{3}$' then raise exception 'Invalid currency'; end if;
 if (f->>'age_min')::integer>(f->>'age_max')::integer then raise exception 'Reversed age range'; end if;
 for k in select jsonb_object_keys(h) loop
  if k not in ('kind','days','start','end') then raise exception 'Unknown horizon key'; end if;
 end loop;
 if h->>'kind'='days' then
  if jsonb_typeof(h->'days') is distinct from 'number' or (h->>'days')::numeric not between 1 and 366
   or (h->>'days')::numeric<>trunc((h->>'days')::numeric) then raise exception 'Invalid horizon days'; end if;
 elsif h->>'kind'='range' then
  if coalesce(h->>'start','') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(h->>'end','') !~ '^\d{4}-\d{2}-\d{2}$'
   or (h->>'end')::date<(h->>'start')::date or (h->>'end')::date-(h->>'start')::date>365 then raise exception 'Invalid date range'; end if;
 else raise exception 'Invalid horizon kind'; end if;
 return new;
end $$;
create trigger validate_s4_rule before insert or update on public.rules for each row execute function public.validate_s4_rule();

create function public.validate_rule_area() returns trigger
language plpgsql set search_path='' as $$
declare p jsonb:=new.parameters; v jsonb; coords jsonb; ring jsonb; x numeric; y numeric; prev numeric; first_x numeric; count_points integer;
begin
 new.center:=null; new.radius_meters:=null; new.polygon:=null;
 if jsonb_typeof(p)<>'object' then raise exception 'Invalid area parameters'; end if;
 if new.kind in ('country','admin','city') then
  if p<>'{}'::jsonb or not exists(select 1 from public.territories t where t.id=new.territory_id and t.kind=new.kind and not t.is_demo) then
   -- Preserve S2's explicitly labelled fixture areas, but never accept them in S4.
   if exists(select 1 from public.rules where id=new.rule_id and filters->>'scope'='s4') then raise exception 'Invalid territory'; end if;
  end if;
  return new;
 end if;
 if new.territory_id is not null then raise exception 'Spatial areas cannot reference a territory'; end if;
 if new.kind='radius' then
  if (select count(*) from jsonb_object_keys(p))<>3 or jsonb_typeof(p->'longitude') is distinct from 'number'
   or jsonb_typeof(p->'latitude') is distinct from 'number' or jsonb_typeof(p->'meters') is distinct from 'number' then raise exception 'Invalid radius parameters'; end if;
  x:=(p->>'longitude')::numeric; y:=(p->>'latitude')::numeric; new.radius_meters:=(p->>'meters')::numeric;
  if x not between -180 and 180 or y not between -90 and 90 or new.radius_meters not between 1 and 500000 then raise exception 'Invalid radius bounds'; end if;
  new.center:=extensions.st_setsrid(extensions.st_makepoint(x,y),4326)::extensions.geography;
 elsif new.kind='polygon' then
  if (select count(*) from jsonb_object_keys(p))<>1 or jsonb_typeof(p->'points') is distinct from 'array' then raise exception 'Polygon points required'; end if;
  coords:=p->'points'; count_points:=jsonb_array_length(coords);
  if count_points not between 3 and 100 then raise exception 'Polygon needs 3 to 100 vertices'; end if;
  for v in select value from jsonb_array_elements(coords) loop
   if jsonb_typeof(v)<>'array' or jsonb_array_length(v)<>2 or jsonb_typeof(v->0)<>'number' or jsonb_typeof(v->1)<>'number' then raise exception 'Invalid vertex'; end if;
   x:=(v->>0)::numeric; y:=(v->>1)::numeric;
   if x not between -180 and 180 or y not between -90 and 90 then raise exception 'Invalid coordinate bounds'; end if;
   if prev is not null and abs(x-prev)>180 then raise exception 'Antimeridian polygons are unsupported in this MVP'; end if;
   if first_x is null then first_x:=x; end if; prev:=x;
  end loop;
  if abs(prev-first_x)>180 then raise exception 'Antimeridian polygons are unsupported in this MVP'; end if;
  if coords->0=coords->(count_points-1) then raise exception 'Provide distinct vertices without closing duplicate'; end if;
  if (select count(distinct value) from jsonb_array_elements(coords))<>count_points then raise exception 'Duplicate polygon vertices'; end if;
  ring:=coords||jsonb_build_array(coords->0);
  new.polygon:=extensions.st_setsrid(extensions.st_geomfromgeojson(jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(ring))::text),4326);
  if not extensions.st_isvalid(new.polygon) or extensions.st_isempty(new.polygon) or extensions.st_area(new.polygon)=0 then raise exception 'Polygon intersects itself or has no area'; end if;
 else raise exception 'Invalid area kind'; end if;
 return new;
end $$;
create trigger validate_rule_area before insert or update on public.rule_areas for each row execute function public.validate_rule_area();

create function public.save_s4_rule(rule_document jsonb, selected_rule uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); result uuid; area jsonb; k text;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':rules',0));
 if jsonb_typeof(rule_document)<>'object' or rule_document->'filters'->>'scope' is distinct from 's4'
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
revoke all on function public.save_s4_rule(jsonb,uuid) from public,anon;
grant execute on function public.save_s4_rule(jsonb,uuid) to authenticated;

-- Hierarchy is evidence of membership even without event coordinates. Otherwise use
-- the actual licensed boundary, never distance from a country/region centre.
create function public.s4_area_matches(a public.rule_areas,e public.events) returns boolean
language sql stable security invoker set search_path='' as $$
 select case when a.kind='radius' then e.location is not null and extensions.st_dwithin(e.location,a.center,a.radius_meters::double precision)
 when a.kind='polygon' then e.location is not null and extensions.st_covers(a.polygon,e.location::extensions.geometry)
 else exists(
  with recursive parents as (
   select id,parent_id,country_code from public.territories where id=e.territory_id and not is_demo
   union select t.id,t.parent_id,t.country_code from public.territories t join parents p on t.id=p.parent_id where not t.is_demo
  ) select 1 from public.territories t where t.id=a.territory_id and not t.is_demo and (
   t.id in (select id from parents) or (a.kind='country' and t.country_code in (select country_code from parents))
   or (e.location is not null and t.boundary is not null and extensions.st_covers(t.boundary,e.location::extensions.geometry))
  )
 ) end
$$;

create function public.s4_matches(selected_rule uuid default null)
returns table(occurrence_id uuid,rule_id uuid)
language sql stable security invoker set search_path='' as $$
 select o.id,r.id from public.rules r join public.occurrences o on true join public.events e on e.id=o.event_id
 join public.sources s on s.id=e.primary_source_id
 cross join lateral (select (now() at time zone r.timezone)::date as today) d
 cross join lateral (select case when r.event_horizon->>'kind'='range' then (r.event_horizon->>'start')::date else d.today end as lo,
  case when r.event_horizon->>'kind'='range' then (r.event_horizon->>'end')::date+1 else d.today+(r.event_horizon->>'days')::integer end as hi) h
 where r.user_id=auth.uid() and r.enabled and r.filters->>'scope'='s4' and (selected_rule is null or r.id=selected_rule)
  and not e.is_demo and not s.is_demo and s.terms_status='allowed' and e.status='scheduled' and o.status='scheduled'
  and exists(select 1 from public.rule_areas a where a.rule_id=r.id and a.user_id=r.user_id and public.s4_area_matches(a,e))
  and (jsonb_array_length(r.filters->'categories')=0 or r.filters->'categories'?e.category_code)
  and (jsonb_array_length(r.filters->'languages')=0 or r.filters->'languages'?e.event_language
   or (e.event_language is null and (r.filters->>'include_unknown_language')::boolean))
  and ((r.filters->>'currency' is null and r.filters->>'price_min' is null and r.filters->>'price_max' is null)
   or (e.price is null and (r.filters->>'include_unknown_price')::boolean)
   or (e.price is not null and e.currency=r.filters->>'currency' and (r.filters->>'price_min' is null or e.price>=(r.filters->>'price_min')::numeric)
    and (r.filters->>'price_max' is null or e.price<=(r.filters->>'price_max')::numeric)))
  and ((r.filters->>'age_min' is null and r.filters->>'age_max' is null)
   or ((e.age_min is null or e.age_max is null) and (r.filters->>'include_unknown_age')::boolean)
   or (e.age_min is not null and e.age_max is not null and (r.filters->>'age_min' is null or e.age_max>=(r.filters->>'age_min')::integer)
    and (r.filters->>'age_max' is null or e.age_min<=(r.filters->>'age_max')::integer)))
  and ((o.time_kind='known' and o.start_at>=now() and (o.start_at at time zone r.timezone)::date>=h.lo and (o.start_at at time zone r.timezone)::date<h.hi)
   or (o.time_kind='date_only' and o.local_date>=greatest(d.today,h.lo) and o.local_date<h.hi))
$$;
revoke all on function public.s4_matches(uuid) from public,anon;
grant execute on function public.s4_matches(uuid) to authenticated;

create function public.list_rule_events(selected_rule uuid default null,page_offset integer default 0)
returns table(id uuid,event_id uuid,time_kind text,start_at timestamptz,local_date date,timezone text,title text,venue text,category_code text,checked_at timestamptz,matched_rules uuid[])
language sql stable security invoker set search_path='' as $$
 select o.id,o.event_id,o.time_kind,o.start_at,o.local_date,o.timezone,e.title,e.venue,e.category_code,e.checked_at,m.rules
 from (select occurrence_id,array_agg(distinct rule_id order by rule_id) rules from public.s4_matches(selected_rule) group by occurrence_id) m
 join public.occurrences o on o.id=m.occurrence_id join public.events e on e.id=o.event_id
 order by coalesce(o.local_date,(o.start_at at time zone o.timezone)::date),o.start_at nulls last,o.id
 limit 30 offset greatest(0,least(page_offset,10000))
$$;
revoke all on function public.list_rule_events(uuid,integer) from public,anon;
grant execute on function public.list_rule_events(uuid,integer) to authenticated;

-- Manual S4 selections: no automatic scheduling or push job (S7).
create function public.build_rule_digest() returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); ids uuid[]; identity text; result uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||':s4-digest',0));
 select array_agg(distinct occurrence_id order by occurrence_id) into ids from public.s4_matches();
 if ids is null then return null; end if;
 if cardinality(ids)>5000 then raise exception 'Narrow filters: selection exceeds 5000 events'; end if;
 -- Include event versions and occurrence times, not only IDs.
 select 's4:'||md5(coalesce(string_agg(o.id::text||':'||e.version||':'||coalesce(o.start_at::text,o.local_date::text,'unknown'),',' order by o.id),'')
  ||coalesce((select string_agg(r.id::text||r.name||r.filters::text||r.event_horizon::text||r.timezone,',' order by r.id) from public.rules r
   where r.user_id=caller and r.enabled and r.filters->>'scope'='s4'),'')
  ||coalesce((select string_agg(a.kind||coalesce(a.territory_id::text,'')||a.parameters::text,',' order by a.rule_id,a.kind,a.territory_id,a.parameters::text)
   from public.rule_areas a join public.rules r on r.id=a.rule_id where r.user_id=caller and r.enabled and r.filters->>'scope'='s4'),'')) into identity
 from public.occurrences o join public.events e on e.id=o.event_id where o.id=any(ids);
 insert into public.digests(user_id,business_key,rule_name) values(caller,identity,'S4') on conflict(user_id,business_key) do nothing returning id into result;
 if result is null then select id into result from public.digests where user_id=caller and business_key=identity; return result; end if;
 insert into public.digest_items(digest_id,user_id,occurrence_id) select result,caller,unnest(ids);
 return result;
end $$;
revoke all on function public.build_rule_digest() from public,anon;
grant execute on function public.build_rule_digest() to authenticated;
