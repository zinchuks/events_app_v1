-- Global gazetteer is separate from rule territories. A point is never a city boundary.
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create or replace function public.place_normalize(value text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(pg_catalog.normalize(extensions.unaccent(coalesce(value,'')),'NFKD'),U&'[\0300-\036F]','','g'))
$$;
create or replace function public.place_prefixes(value text) returns text[] language sql immutable set search_path='' as $$
 select coalesce(array_agg(distinct left(term,2)),array[]::text[]) from unnest(regexp_split_to_array(value,'[[:space:],;/|]+')) term where length(term)>=2
$$;
revoke all on function public.place_prefixes(text) from public,anon,authenticated;
create table public.place_catalog (
 geoname_id bigint primary key check(geoname_id>0),
 kind text not null check(kind in ('country','admin','city')),
 feature_code text not null,
 country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 name text not null, names jsonb not null,
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 population bigint not null check(population>=0), timezone text,
 admin_path text[] not null, parent_geoname_id bigint,
 search_text text not null, active boolean not null default true,
 modified_on date not null
);
create index place_search_idx on public.place_catalog using gin(search_text extensions.gin_trgm_ops);
create index place_prefix_idx on public.place_catalog using gin(public.place_prefixes(search_text));
create index place_popularity_idx on public.place_catalog(kind,population desc,geoname_id) where active;
create index place_admin_idx on public.place_catalog(country_code,feature_code,admin_path);
create table public.place_imports (
 fingerprint text primary key, imported_at timestamptz not null default now(),
 evidence jsonb not null
);
alter table public.place_catalog enable row level security;
alter table public.place_imports enable row level security;
revoke all on public.place_catalog,public.place_imports from public,anon,authenticated;
grant all on public.place_catalog,public.place_imports to service_role;
alter table public.territories add column geoname_id bigint unique;
-- Nullable metadata: generic PPL does not distinguish a village from a city.
alter table public.territories add column place_feature_code text;

create or replace function public.place_result(t public.territories) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('key','territory:'||t.id,'territory_id',t.id,'kind',t.kind,'names',t.names,
 'country_code',t.country_code,'region',coalesce(gp.names->>'und',gp.name,p.names->>'und',p.names->>'en',''),
 'longitude',coalesce(case when t.center is not null then extensions.st_x(t.center::extensions.geometry) end,g.longitude),
 'latitude',coalesce(case when t.center is not null then extensions.st_y(t.center::extensions.geometry) end,g.latitude),
 'has_boundary',t.boundary is not null,'geoname_id',t.geoname_id,'feature_code',t.place_feature_code,
 'provenance',t.provenance,'has_catalog_events',exists(select 1 from public.events e join public.sources s on s.id=e.primary_source_id
 where e.territory_id=t.id and not e.is_demo and not s.is_demo and s.terms_status='allowed' and s.allow_cache))
 from (select 1) x left join public.territories p on p.id=t.parent_id left join public.place_catalog g on g.geoname_id=t.geoname_id left join public.place_catalog gp on gp.geoname_id=g.parent_geoname_id
$$;
create or replace function public.search_places(query_text text default '',place_kind text default 'city',locale text default 'uk',country text default null,page_offset integer default 0)
 returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='5s' as $$
declare needle text:=public.place_normalize(btrim(query_text)); pattern text; result jsonb;
begin
 if query_text is null or length(query_text)>100 or place_kind is null or place_kind not in ('city','admin','country')
 or locale is null or locale not in ('uk','en','es') or page_offset is null or page_offset not between 0 and 10000
 or (country is not null and country !~ '^[A-Z]{2}$') then raise exception 'Invalid place search' using errcode='22023'; end if;
 if length(needle)=1 then return jsonb_build_object('items','[]'::jsonb,'has_more',false); end if;
 pattern:='%'||replace(replace(replace(needle,E'\\',E'\\\\'),'%',E'\\%'),'_',E'\\_')||'%';
 with hits as materialized (
  (select c.geoname_id,1 rank,c.population from public.place_catalog c where needle='' and c.active and c.kind=place_kind and (country is null or c.country_code=country)
   and not exists(select 1 from public.territories t where t.geoname_id=c.geoname_id and not t.is_demo)
   order by c.population desc,c.geoname_id limit 26+page_offset)
  union all
  (select c.geoname_id,case when public.place_normalize(coalesce(c.names->>locale,c.name))=needle then 0 else 1 end rank,c.population
   from public.place_catalog c where needle<>'' and c.active and c.kind=place_kind and (country is null or c.country_code=country) and ((length(needle)=2 and public.place_prefixes(c.search_text) @> array[needle]) or (length(needle)>2 and c.search_text like pattern))
   and not exists(select 1 from public.territories t where t.geoname_id=c.geoname_id and not t.is_demo)
   order by rank,c.population desc,c.geoname_id limit 26+page_offset)
 ), candidates as (
  select t.id::text as tie,public.place_result(t) data,case when public.place_normalize(coalesce(t.names->>locale,t.names->>'und',t.names->>'en'))=needle then 0 else 1 end rank,9223372036854775807::bigint popularity
  from public.territories t where not t.is_demo and t.kind=place_kind and (country is null or t.country_code=country)
   and (needle='' or public.place_normalize(t.names::text||' '||t.country_code) like pattern or exists(select 1 from public.place_catalog linked where linked.geoname_id=t.geoname_id and linked.search_text like pattern))
  union all
  select lpad(c.geoname_id::text,12,'0'),jsonb_build_object('key','geonames:'||c.geoname_id,'territory_id',null,'kind',c.kind,'names',c.names,
   'country_code',c.country_code,'region',coalesce(p.names->>locale,p.name,''),'longitude',c.longitude,'latitude',c.latitude,
   'has_boundary',false,'geoname_id',c.geoname_id,'feature_code',c.feature_code,
   'provenance','GeoNames · CC BY 4.0','has_catalog_events',false),
   h.rank,h.population
  from hits h join public.place_catalog c on c.geoname_id=h.geoname_id left join public.place_catalog p on p.geoname_id=c.parent_geoname_id

 ), page as (select data,row_number() over(order by rank,popularity desc,tie) n from candidates order by rank,popularity desc,tie limit 26 offset page_offset)
 select jsonb_build_object('items',coalesce(jsonb_agg(data order by n) filter(where n<=page_offset+25),'[]'::jsonb),'has_more',count(*)>25) into result from page;
 return result;
end $$;

create function public.resolve_place(place_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.territories; c public.place_catalog; parent_key uuid; parent_result jsonb; gid bigint;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if place_key ~ '^territory:[0-9a-f-]{36}$' then
  select * into t from public.territories where id=substring(place_key from 11)::uuid and not is_demo;
  if not found then raise exception 'Place unavailable'; end if;
  return public.place_result(t);
 end if;
 if place_key is null or place_key !~ '^geonames:[0-9]{1,12}$' then raise exception 'Invalid place key'; end if;
 gid:=substring(place_key from 10)::bigint;
 select * into c from public.place_catalog where geoname_id=gid and active;
 if not found then raise exception 'Place unavailable'; end if;
 select * into t from public.territories where geoname_id=gid and not is_demo;
 if found then return public.place_result(t); end if;
 -- Countries reuse reviewed ISO territories, preserving existing IDs/boundaries/names.
 if c.kind='country' then
  select * into t from public.territories where external_id='iso3166:'||c.country_code and kind='country' and not is_demo;
  if found then update public.territories set geoname_id=gid,place_feature_code=c.feature_code where id=t.id returning * into t;return public.place_result(t);end if;
 end if;
 if c.parent_geoname_id is not null then
  parent_result:=public.resolve_place('geonames:'||c.parent_geoname_id);parent_key:=(parent_result->>'territory_id')::uuid;
 end if;
 insert into public.territories(external_id,kind,country_code,parent_id,names,center,provenance,geoname_id,place_feature_code)
 values('geonames:'||gid,c.kind,c.country_code,parent_key,c.names,extensions.st_setsrid(extensions.st_makepoint(c.longitude,c.latitude),4326)::extensions.geography,
 'GeoNames · CC BY 4.0 · https://www.geonames.org/'||gid,gid,c.feature_code)
 on conflict(geoname_id) do nothing;
 select * into t from public.territories where geoname_id=gid;
 return public.place_result(t);
end $$;
revoke all on function public.place_normalize(text),public.place_result(public.territories),public.search_places(text,text,text,text,integer),public.resolve_place(text) from public,anon,authenticated;
grant execute on function public.search_places(text,text,text,text,integer) to anon,authenticated;
grant execute on function public.resolve_place(text) to authenticated;
