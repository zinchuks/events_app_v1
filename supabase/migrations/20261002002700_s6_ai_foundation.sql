-- S6 provider-neutral preparation only. Disabled by default; no API adapter/model chosen.
alter table public.translations add column model_id text;
alter table public.translations add column prompt_version text;
alter table public.translations add column input_hash text;

create table public.s6_ai_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 provider text check(provider ~ '^[a-z][a-z0-9_-]{0,39}$'),
 model_id text check(length(trim(model_id)) between 1 and 200),
 prompt_version text not null default 'event-translation-v1' check(prompt_version='event-translation-v1'),
 locales text[] not null default '{}' check(locales <@ array['uk','en','es']::text[]),
 currency text check(currency ~ '^[A-Z]{3}$'),
 daily_limit numeric(18,6) check(daily_limit>0 and daily_limit<=1000000),
 request_ceiling numeric(18,6) check(request_ceiling>0 and request_ceiling<=daily_limit),
 pricing_verified_at timestamptz,
 check(not enabled or (provider is not null and model_id is not null and currency is not null
  and daily_limit is not null and request_ceiling is not null and cardinality(locales)>0 and pricing_verified_at is not null))
);
insert into public.s6_ai_settings(singleton) values(true);
create table public.s6_ai_days (
 day date not null, currency text not null check(currency ~ '^[A-Z]{3}$'),
 committed numeric(18,6) not null default 0 check(committed>=0 and committed<=1000000000),
 primary key(day,currency)
);
create table public.s6_ai_requests (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references public.events(id) on delete cascade,
 version integer not null check(version>0), locale text not null check(locale in ('uk','en','es')),
 provider text not null, model_id text not null, prompt_version text not null,
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'), input_snapshot jsonb not null,
 status text not null check(status in ('reserved','dispatching','ready','failed','uncertain','superseded','released')),
 token uuid not null, lease_until timestamptz not null,
 budget_day date not null, currency text not null, ceiling numeric(18,6) not null check(ceiling>0),
 charge numeric(18,6) check(charge>=0), overrun boolean not null default false,
 output jsonb, created_at timestamptz not null default now(), finished_at timestamptz,
 unique(event_id,version,locale,provider,model_id,prompt_version,input_hash),
 foreign key(budget_day,currency) references public.s6_ai_days(day,currency)
);
alter table public.s6_ai_settings enable row level security;
alter table public.s6_ai_days enable row level security;
alter table public.s6_ai_requests enable row level security;
revoke all on public.s6_ai_settings,public.s6_ai_days,public.s6_ai_requests from anon,authenticated;
grant all on public.s6_ai_settings,public.s6_ai_days,public.s6_ai_requests to service_role;

create function public.s6_ai_input_hash(title text,description text) returns text
language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_object('title',title,'description',coalesce(description,''))::text,'UTF8'),'sha256'),'hex')
$$;

create function public.reserve_s6_ai(selected_event uuid,selected_locale text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.s6_ai_settings; e public.events; src public.sources; job public.s6_ai_requests;
 digest text; budget_date date:=(now() at time zone 'UTC')::date; total_committed numeric; claim uuid:=gen_random_uuid();
begin
 select * into cfg from public.s6_ai_settings where singleton for update;
 if not cfg.enabled then return '{"status":"disabled"}'::jsonb; end if;
 if selected_locale is null or not(selected_locale=any(cfg.locales)) then return '{"status":"locale_unavailable"}'::jsonb; end if;
 select * into e from public.events where id=selected_event for share;
 select * into src from public.sources where id=e.primary_source_id;
 if e.id is null or e.is_demo or src.is_demo or src.terms_status<>'allowed' or not src.allow_cache or not src.allow_translate
 then return '{"status":"source_unavailable"}'::jsonb; end if;
 if exists(select 1 from public.translations where event_id=e.id and version=e.version and locale=selected_locale and status='ready' and provider like 'source:%')
 then return '{"status":"source_translation"}'::jsonb; end if;
 digest:=public.s6_ai_input_hash(e.title,e.description);
 select * into job from public.s6_ai_requests where event_id=e.id and version=e.version and locale=selected_locale
  and provider=cfg.provider and model_id=cfg.model_id and prompt_version=cfg.prompt_version and input_hash=digest for update;
 if job.id is not null and job.status<>'released' then
  return jsonb_build_object('status',case when job.status='ready' then 'cached' when job.status in ('reserved','dispatching') then 'in_progress' else job.status end,'request_id',job.id);
 end if;
 if not coalesce(src.last_success_at>=now()-make_interval(secs=>src.freshness_seconds)
  and e.checked_at>=now()-make_interval(secs=>src.freshness_seconds),false) then return '{"status":"stale"}'::jsonb; end if;
 -- No FX/resetting today's spend by changing currency. A new currency requires a new UTC day.
 if exists(select 1 from public.s6_ai_days where day=budget_date and currency<>cfg.currency and committed>0)
 then return '{"status":"currency_change_blocked"}'::jsonb; end if;
 insert into public.s6_ai_days(day,currency) values(budget_date,cfg.currency) on conflict do nothing;
 select d.committed into total_committed from public.s6_ai_days d where day=budget_date and currency=cfg.currency for update;
 if total_committed+cfg.request_ceiling>cfg.daily_limit then return '{"status":"budget_exhausted"}'::jsonb; end if;
 update public.s6_ai_days set committed=committed+cfg.request_ceiling where day=budget_date and currency=cfg.currency;
 insert into public.s6_ai_requests(event_id,version,locale,provider,model_id,prompt_version,input_hash,input_snapshot,
  status,token,lease_until,budget_day,currency,ceiling)
 values(e.id,e.version,selected_locale,cfg.provider,cfg.model_id,cfg.prompt_version,digest,
  jsonb_build_object('title',e.title,'description',coalesce(e.description,'')),
  'reserved',claim,now()+interval '2 minutes',budget_date,cfg.currency,cfg.request_ceiling)
 on conflict(event_id,version,locale,provider,model_id,prompt_version,input_hash) do update set
  status='reserved',token=excluded.token,lease_until=excluded.lease_until,budget_day=excluded.budget_day,currency=excluded.currency,
  ceiling=excluded.ceiling,charge=null,overrun=false,output=null,finished_at=null returning id into job.id;
 return jsonb_build_object('status','reserved','request_id',job.id,'token',claim);
end $$;

create function public.release_s6_ai(selected_request uuid,claim_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare job public.s6_ai_requests;
begin
 perform 1 from public.s6_ai_settings where singleton for update;
 select * into job from public.s6_ai_requests where id=selected_request and token=claim_token for update;
 -- Safe only before dispatch. Expired dispatches/uncertain responses must never be refunded/retried automatically.
 if job.id is null or job.status<>'reserved' then return false; end if;
 update public.s6_ai_days set committed=committed-job.ceiling where day=job.budget_day and currency=job.currency;
 update public.s6_ai_requests set status='released',finished_at=now() where id=job.id;
 return true;
end $$;

create function public.begin_s6_ai(selected_request uuid,claim_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg public.s6_ai_settings; job public.s6_ai_requests; e public.events; src public.sources;
begin
 select * into cfg from public.s6_ai_settings where singleton for update;
 select * into job from public.s6_ai_requests where id=selected_request and token=claim_token for update;
 if job.id is null or job.status<>'reserved' or job.lease_until<=now() or not cfg.enabled then return null; end if;
 select * into e from public.events where id=job.event_id for share;
 select * into src from public.sources where id=e.primary_source_id;
 if e.version<>job.version or public.s6_ai_input_hash(e.title,e.description)<>job.input_hash
  or src.terms_status<>'allowed' or not src.allow_cache or not src.allow_translate
  or not coalesce(src.last_success_at>=now()-make_interval(secs=>src.freshness_seconds)
   and e.checked_at>=now()-make_interval(secs=>src.freshness_seconds),false)
  or (cfg.provider,cfg.model_id,cfg.prompt_version,cfg.currency) is distinct from (job.provider,job.model_id,job.prompt_version,job.currency)
  or not(job.locale=any(cfg.locales)) then return null; end if;
 update public.s6_ai_requests set status='dispatching' where id=job.id;
 return jsonb_build_object('request_id',job.id,'provider',job.provider,'model_id',job.model_id,'prompt_version',job.prompt_version,
  'locale',job.locale,'source',job.input_snapshot,'ceiling',job.ceiling,'currency',job.currency);
end $$;

create function public.finish_s6_ai(selected_request uuid,claim_token uuid,outcome text,result jsonb default null,actual_cost numeric default null) returns text
language plpgsql security definer set search_path='' as $$
declare job public.s6_ai_requests; e public.events; src public.sources; cfg public.s6_ai_settings; cost numeric; final_status text;
begin
 select * into cfg from public.s6_ai_settings where singleton for update;
 select * into job from public.s6_ai_requests where id=selected_request and token=claim_token for update;
 if job.id is null then raise exception 'Invalid AI claim' using errcode='22023'; end if;
 if job.status in ('ready','failed','uncertain','superseded') then return job.status; end if;
 if job.status<>'dispatching' or outcome is null or outcome not in ('ready','failed','uncertain')
  or (actual_cost is not null and actual_cost not between 0 and 1000000)
 then raise exception 'Invalid AI completion' using errcode='22023'; end if;
 if outcome='uncertain' and actual_cost is not null then raise exception 'Ambiguous charge must retain ceiling'; end if;
 if outcome='ready' and (jsonb_typeof(result) is distinct from 'object' or not(result ?& array['title','description','summary'])
  or (select count(*) from jsonb_object_keys(result))<>3
  or jsonb_typeof(result->'title') is distinct from 'string' or length(trim(result->>'title')) not between 1 and 400
  or jsonb_typeof(result->'description') is distinct from 'string' or length(result->>'description')>20000
  or jsonb_typeof(result->'summary') is distinct from 'string' or length(trim(result->>'summary')) not between 1 and 600)
 then raise exception 'Invalid AI text schema' using errcode='22023'; end if;
 -- Unknown/failed cost conservatively consumes the full reservation, also across UTC midnight.
 cost:=case when actual_cost is null then job.ceiling else ceil(actual_cost*1000000)/1000000 end;
 update public.s6_ai_days set committed=committed-job.ceiling+cost where day=job.budget_day and currency=job.currency;
 final_status:=outcome;
 select * into e from public.events where id=job.event_id for share;
 select * into src from public.sources where id=e.primary_source_id;
 if outcome='ready' and (e.version<>job.version or public.s6_ai_input_hash(e.title,e.description)<>job.input_hash
  or src.terms_status<>'allowed' or not src.allow_cache or not src.allow_translate
  or (cfg.provider,cfg.model_id,cfg.prompt_version) is distinct from (job.provider,job.model_id,job.prompt_version)
  or not(job.locale=any(cfg.locales)))
 then final_status:='superseded'; end if;
 update public.s6_ai_requests set status=final_status,charge=cost,overrun=cost>job.ceiling,
  output=case when final_status='ready' then result else null end,finished_at=now() where id=job.id;
 if final_status='ready' then
  insert into public.translations(event_id,version,locale,provider,status,title,description,summary,model_id,prompt_version,input_hash)
  values(job.event_id,job.version,job.locale,'ai:'||job.provider,'ready',result->>'title',result->>'description',result->>'summary',job.model_id,job.prompt_version,job.input_hash)
  on conflict(event_id,version,locale,provider) do update set status='ready',title=excluded.title,description=excluded.description,
   summary=excluded.summary,model_id=excluded.model_id,prompt_version=excluded.prompt_version,input_hash=excluded.input_hash;
 end if;
 return final_status;
end $$;

create function public.s6_ai_translation_current(selected_event uuid,selected_version integer,selected_locale text,
 selected_provider text,selected_model text,selected_prompt text,selected_hash text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.s6_ai_requests j join public.events e on e.id=j.event_id cross join public.s6_ai_settings c
  where c.singleton and j.event_id=selected_event and j.version=selected_version and j.locale=selected_locale and j.status='ready'
   and 'ai:'||j.provider=selected_provider and j.model_id=selected_model and j.prompt_version=selected_prompt and j.input_hash=selected_hash
   and (j.provider,j.model_id,j.prompt_version)=(c.provider,c.model_id,c.prompt_version)
   and j.locale=any(c.locales) and e.version=j.version and public.s6_ai_input_hash(e.title,e.description)=j.input_hash)
$$;
drop policy ready_current_translation on public.translations;
create policy ready_current_translation on public.translations for select to anon,authenticated using(
 status='ready' and exists(select 1 from public.events e join public.sources s on s.id=e.primary_source_id
  where e.id=event_id and e.version=translations.version and not e.is_demo and not s.is_demo and s.terms_status='allowed' and s.allow_cache and s.allow_translate)
 and (provider like 'source:%' or public.s6_ai_translation_current(event_id,version,locale,provider,model_id,prompt_version,input_hash)));

revoke all on function public.s6_ai_input_hash(text,text),public.reserve_s6_ai(uuid,text),public.release_s6_ai(uuid,uuid),
 public.begin_s6_ai(uuid,uuid),public.finish_s6_ai(uuid,uuid,text,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.s6_ai_input_hash(text,text),public.reserve_s6_ai(uuid,text),public.release_s6_ai(uuid,uuid),
 public.begin_s6_ai(uuid,uuid),public.finish_s6_ai(uuid,uuid,text,jsonb,numeric) to service_role;
revoke all on function public.s6_ai_translation_current(uuid,integer,text,text,text,text,text) from public;
grant execute on function public.s6_ai_translation_current(uuid,integer,text,text,text,text,text) to anon,authenticated,service_role;
