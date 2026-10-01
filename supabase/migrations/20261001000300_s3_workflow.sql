-- S3: one real city, a simple category rule and a manual atomic digest.
insert into public.territories(country_code,external_id,kind,names,provenance,is_demo)
values('ES','madrid:municipio:Madrid','city','{"uk":"Мадрид","en":"Madrid","es":"Madrid"}',
 'Madrid official event feed address.area.locality=MADRID; no administrative boundary imported',false)
on conflict(external_id) do nothing;
alter table public.profiles add column push_enabled boolean not null default false;
grant update(push_enabled) on public.profiles to authenticated;
alter table public.digests add column rule_id uuid references public.rules(id) on delete set null;
alter table public.digests add column rule_name text;
alter table public.digests add column horizon_start date;
alter table public.digests add column horizon_end date;
alter table public.notification_jobs add column digest_id uuid;
alter table public.notification_jobs add column transport text not null default 'fixture' check(transport in ('fixture','expo'));
alter table public.notification_jobs add constraint jobs_digest_owner foreign key(digest_id,user_id) references public.digests(id,user_id) on delete cascade;
create unique index s3_one_rule_per_owner on public.rules(user_id) where filters->>'scope'='s3';

create function public.save_s3_rule(category_codes text[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare caller uuid := auth.uid(); result uuid; city uuid; codes jsonb;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if category_codes is null or cardinality(category_codes)>11 or exists(
   select 1 from unnest(category_codes) c where c is null or not exists(select 1 from public.categories where code=c)
 ) then raise exception 'Invalid categories' using errcode='22023'; end if;
 select coalesce(jsonb_agg(code order by code),'[]'::jsonb) into codes from (select distinct unnest(category_codes) code) c;
 select id into city from public.territories where external_id='madrid:municipio:Madrid' and not is_demo;
 insert into public.rules(user_id,name,enabled,filters,event_horizon,timezone)
 values(caller,'Madrid',true,jsonb_build_object('scope','s3','categories',codes),'{"days":30}','Europe/Madrid')
 on conflict(user_id) where filters->>'scope'='s3' do update set filters=excluded.filters,enabled=true,event_horizon=excluded.event_horizon,timezone=excluded.timezone
 returning id into result;
 delete from public.rule_areas where rule_id=result and user_id=caller;
 insert into public.rule_areas(rule_id,user_id,kind,territory_id) values(result,caller,'city',city);
 return result;
end $$;
revoke all on function public.save_s3_rule(text[]) from public,anon;
grant execute on function public.save_s3_rule(text[]) to authenticated;

create function public.build_s3_digest(selected_rule uuid) returns uuid
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
   and s.last_success_at>now()-interval '48 hours' and e.status='scheduled' and o.status='scheduled'
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
revoke all on function public.build_s3_digest(uuid) from public,anon;
grant execute on function public.build_s3_digest(uuid) to authenticated;

create function public.register_push_device(expo_token text, device_platform text) returns void
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if expo_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$' or device_platform not in ('ios','android') then
  raise exception 'Invalid push device' using errcode='22023'; end if;
 insert into public.device_tokens(user_id,token,platform) values(caller,expo_token,device_platform)
 on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now();
 update public.profiles set push_enabled=true where id=caller;
end $$;
revoke all on function public.register_push_device(text,text) from public,anon;
grant execute on function public.register_push_device(text,text) to authenticated;

create function public.claim_s3_notification(job_transport text) returns setof public.notification_jobs
language sql security definer set search_path='' as $$
 update public.notification_jobs j set status='claimed',attempts=attempts+1,lease_until=now()+interval '5 minutes'
 where j.id=(select id from public.notification_jobs where transport=job_transport and digest_id is not null
  and run_at<=now() and status='pending' order by run_at,id for update skip locked limit 1)
 returning j.*
$$;
revoke all on function public.claim_s3_notification(text) from public,anon,authenticated;
grant execute on function public.claim_s3_notification(text) to service_role;
