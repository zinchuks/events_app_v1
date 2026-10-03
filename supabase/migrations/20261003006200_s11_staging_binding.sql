-- A worker must verify the actual database, not only trust an APP_ENV label.
create table public.s11_runtime (
 id boolean primary key default true check(id),
 environment text not null default 'development' check(environment in ('development','staging')),
 api_host text check(api_host ~ '^[a-z0-9-]+\.supabase\.co$'),
 check(environment='development' or api_host is not null)
);
insert into public.s11_runtime(id) values(true);
alter table public.s11_runtime enable row level security;
revoke all on public.s11_runtime from public,anon,authenticated;
grant all on public.s11_runtime to service_role;
create function public.verify_s11_staging(expected_host text) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if expected_host is null or not exists(select 1 from public.s11_runtime where id and environment='staging' and api_host=expected_host) then
  raise exception 'Staging database binding required' using errcode='42501';
 end if;
end $$;
revoke all on function public.verify_s11_staging(text) from public,anon,authenticated;
grant execute on function public.verify_s11_staging(text) to service_role;
