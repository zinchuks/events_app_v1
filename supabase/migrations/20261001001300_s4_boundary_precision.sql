-- One micrometre numeric tolerance: ST_Distance rounds its returned geography distance.
create or replace function public.s4_area_matches(a public.rule_areas,e public.events) returns boolean
language sql stable security invoker set search_path='' as $$
 select case when a.kind='radius' then e.location is not null and extensions.st_dwithin(e.location,a.center,a.radius_meters::double precision+0.000001)
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
