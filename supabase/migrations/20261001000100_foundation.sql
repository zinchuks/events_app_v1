-- S2 schema only: ingestion, matching, scheduling and billing logic are later stages.
create extension if not exists postgis with schema extensions;

create function public.valid_timezone(value text) returns boolean
language sql stable set search_path = '' as $$
  select exists(select 1 from pg_catalog.pg_timezone_names where name = value)
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'uk' check (locale in ('uk','en','es')),
  translation_locale text not null default 'uk' check (translation_locale in ('uk','en','es')),
  notification_timezone text not null default 'UTC' check (public.valid_timezone(notification_timezone)),
  created_at timestamptz not null default now()
);

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  external_id text not null unique,
  kind text not null check (kind in ('country','admin','city')),
  parent_id uuid references public.territories(id),
  names jsonb not null check (jsonb_typeof(names) = 'object'),
  center extensions.geography(Point,4326),
  boundary extensions.geometry(MultiPolygon,4326),
  provenance text not null,
  is_demo boolean not null default false,
  check (boundary is null or extensions.st_isvalid(boundary))
);
create index territories_parent_idx on public.territories(parent_id);
create index territories_country_idx on public.territories(country_code,kind);
create index territories_center_idx on public.territories using gist(center);
create index territories_boundary_idx on public.territories using gist(boundary);

create table public.categories (
  code text primary key,
  parent_code text references public.categories(code),
  names jsonb not null check (jsonb_typeof(names) = 'object')
);
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null check (url ~ '^https?://'),
  acquisition text not null check (acquisition in ('api','ics','html','fixture')),
  terms_status text not null default 'unreviewed' check (terms_status in ('unreviewed','allowed','blocked','fixture')),
  rights_reference text,
  allow_cache boolean not null default false,
  allow_translate boolean not null default false,
  allow_images boolean not null default false,
  poll_interval_seconds integer check (poll_interval_seconds > 0),
  last_success_at timestamptz,
  is_demo boolean not null default false
);
create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  external_id text not null,
  payload_hash text not null,
  fetched_at timestamptz not null,
  canonical_url text not null check (canonical_url ~ '^https?://'),
  raw_payload jsonb,
  unique(source_id,external_id)
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  primary_source_id uuid not null references public.sources(id),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  checked_at timestamptz not null,
  series_id uuid references public.events(id),
  title text not null check (length(trim(title)) > 0),
  description text,
  category_code text references public.categories(code),
  original_language text,
  event_language text,
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','review')),
  venue text,
  territory_id uuid references public.territories(id),
  location extensions.geography(Point,4326),
  price numeric check (price >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  version integer not null default 1 check (version > 0),
  is_demo boolean not null default false,
  check ((price is null) = (currency is null))
);
create index events_territory_idx on public.events(territory_id);
create index events_location_idx on public.events using gist(location);
create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  external_id text not null,
  time_kind text not null check (time_kind in ('known','date_only','unknown')),
  start_at timestamptz,
  end_at timestamptz,
  local_date date,
  timezone text check (timezone is null or public.valid_timezone(timezone)),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','review')),
  unique(event_id,external_id),
  check (end_at is null or (start_at is not null and end_at >= start_at)),
  check ((time_kind = 'known' and start_at is not null and timezone is not null and local_date is null)
    or (time_kind = 'date_only' and local_date is not null and start_at is null and end_at is null)
    or (time_kind = 'unknown' and start_at is null and end_at is null and local_date is null))
);
create index occurrences_start_idx on public.occurrences(start_at);
create table public.event_sources (
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  source_record_id uuid not null references public.source_records(id),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  checked_at timestamptz not null,
  primary key(occurrence_id,source_record_id)
);
create index event_sources_record_idx on public.event_sources(source_record_id);
create table public.translations (
  event_id uuid not null references public.events(id) on delete cascade,
  version integer not null check (version > 0),
  locale text not null,
  provider text not null,
  status text not null check (status in ('pending','ready','failed')),
  title text,
  description text,
  primary key(event_id,version,locale,provider)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  filters jsonb not null default '{}',
  event_horizon jsonb not null default '{}',
  delivery_schedule jsonb not null default '{}',
  timezone text not null default 'UTC' check (public.valid_timezone(timezone)),
  next_run_at timestamptz,
  unique(id,user_id)
);
create table public.rule_areas (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('country','admin','city','radius','polygon')),
  territory_id uuid references public.territories(id),
  parameters jsonb not null default '{}',
  foreign key(rule_id,user_id) references public.rules(id,user_id) on delete cascade
);
create table public.saved_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurrence_id uuid not null references public.occurrences(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id,occurrence_id)
);
create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios','android')),
  updated_at timestamptz not null default now()
);
create table public.digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_key text not null,
  created_at timestamptz not null default now(),
  unique(user_id,business_key), unique(id,user_id)
);
create table public.digest_items (
  digest_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  occurrence_id uuid not null references public.occurrences(id),
  foreign key(digest_id,user_id) references public.digests(id,user_id) on delete cascade,
  primary key(digest_id,occurrence_id)
);
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  business_key text not null unique,
  run_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','claimed','sent','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  unique(id,user_id)
);
create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  receipt_id text,
  status text not null,
  foreign key(job_id,user_id) references public.notification_jobs(id,user_id) on delete cascade
);
create table public.entitlements (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free','plus')),
  expires_at timestamptz,
  provider_reference text
);
create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null,
  diagnostic jsonb
);

-- Explicit grants: public catalog read-only; raw payloads/operations server-only.
do $$ declare t text; begin
  foreach t in array array['territories','categories','sources','events','occurrences','event_sources','translations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to anon, authenticated',t);
    execute format('create policy catalog_read on public.%I for select to anon, authenticated using (true)',t);
  end loop;
  foreach t in array array['source_records','ingestion_runs'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
  end loop;
  foreach t in array array['rules','rule_areas','saved_events','device_tokens'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to authenticated',t);
    execute format('create policy owner_access on public.%I to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    execute format('create index on public.%I(user_id)',t);
  end loop;
  foreach t in array array['digests','digest_items','notification_jobs','deliveries','entitlements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy owner_read on public.%I for select to authenticated using ((select auth.uid()) = user_id)',t);
    execute format('create index on public.%I(user_id)',t);
  end loop;
end $$;
alter table public.profiles enable row level security;
revoke all on public.profiles from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(locale,translation_locale,notification_timezone) on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profile_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create function public.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id) values(new.id);
  return new;
end $$;
revoke all on function public.create_profile() from public,anon,authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();

-- No user ID argument: a caller can only delete their own account.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  delete from auth.users where id = caller;
end $$;
revoke all on function public.delete_my_account() from public,anon,authenticated;
grant execute on function public.delete_my_account() to authenticated;
