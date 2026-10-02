-- pg_timezone_names builds all UTC offsets on every evaluation (~30ms per check here).
-- Occurrence inserts evaluate the constraint twice: a 1182-row batch took 75s and
-- exceeded the HTTP gateway timeout. Preserve the exact accepted-name set via lookup.
create table public.timezone_names(name text primary key);
insert into public.timezone_names(name) select name from pg_catalog.pg_timezone_names;
alter table public.timezone_names enable row level security;
revoke all on public.timezone_names from anon,authenticated;
grant select on public.timezone_names to anon,authenticated;
grant all on public.timezone_names to service_role;
create policy timezone_catalog_read on public.timezone_names for select to anon,authenticated using(true);
create or replace function public.valid_timezone(value text) returns boolean
language sql stable set search_path='' as $$
 select exists(select 1 from public.timezone_names where name=value)
$$;
-- Refresh this inventory in a migration whenever the database tzdata package changes.
