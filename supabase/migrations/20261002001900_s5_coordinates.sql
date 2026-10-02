create function public.s5_event_coordinates(occurrence uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('longitude',extensions.st_x(e.location::extensions.geometry),'latitude',extensions.st_y(e.location::extensions.geometry))
 from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
 where o.id=occurrence and not e.is_demo and not s.is_demo and s.terms_status='allowed' and e.location is not null
$$;
revoke all on function public.s5_event_coordinates(uuid) from public;
grant execute on function public.s5_event_coordinates(uuid) to anon,authenticated;

-- Explicitly reject NULL input; applied database follows the same contract as fresh installs.
create or replace function public.list_s5_events(view_mode text default 'catalog', search_text text default '', page_offset integer default 0, page_size integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if view_mode is null or search_text is null or page_offset is null or page_size is null or view_mode not in ('catalog','matches') or length(search_text)>120 or page_offset not between 0 and 10000 or page_size not between 1 and 1000 then raise exception 'Invalid catalog request'; end if;
 if view_mode='matches' and auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 with matches as (
  select occurrence_id,array_agg(distinct rule_id order by rule_id) rules
  from public.s4_matches() where view_mode='matches' group by occurrence_id
 ), eligible as (
  select o.id,o.event_id,o.time_kind,o.start_at,o.local_date,o.timezone,e.title,e.venue,e.category_code,e.checked_at,
   coalesce(m.rules,array[]::uuid[]) as matched_rules,
   case when e.location is not null then extensions.st_x(e.location::extensions.geometry) end as longitude,
   case when e.location is not null then extensions.st_y(e.location::extensions.geometry) end as latitude,
   coalesce(o.local_date,(o.start_at at time zone o.timezone)::date) as sort_date
  from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
  left join matches m on m.occurrence_id=o.id
  where not e.is_demo and not s.is_demo and s.terms_status='allowed' and e.status='scheduled' and o.status='scheduled'
   and (view_mode='catalog' or m.occurrence_id is not null)
   and ((o.time_kind='known' and o.start_at>=now()) or (o.time_kind='date_only' and o.local_date>=(now() at time zone coalesce(o.timezone,'UTC'))::date))
   and (trim(search_text)='' or strpos(lower(e.title||' '||coalesce(e.venue,'')||' '||coalesce(e.description,'')),lower(trim(search_text)))>0)
 ), page as (select * from eligible order by sort_date,start_at nulls last,id limit page_size offset page_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'sort_date' order by p.sort_date,p.start_at nulls last,p.id) from page p),'[]'::jsonb),
  'total',(select count(*) from eligible),'mapped',(select count(*) from eligible where longitude is not null and latitude is not null)) into result;
 return result;
end $$;
create or replace function public.validate_s5_delivery() returns trigger language plpgsql set search_path='' as $$
declare d jsonb:=new.delivery_schedule; v jsonb;
begin
 if new.filters->>'scope' is distinct from 's4' or d='{}'::jsonb then return new; end if;
 if jsonb_typeof(d) is distinct from 'object' or d->>'mode' is null or d->>'mode' not in ('manual','daily','weekdays','interval')
  or d->'active' is distinct from 'false'::jsonb
  or exists(select 1 from jsonb_object_keys(d) k where k not in ('mode','active','time','weekdays','days','anchor')) then raise exception 'Invalid delivery preference'; end if;
 if d->>'mode'<>'manual' then
  if jsonb_typeof(d->'time') is distinct from 'string' or d->>'time' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Invalid local time'; end if;
 end if;
 if d->>'mode'='weekdays' then
  if jsonb_typeof(d->'weekdays') is distinct from 'array' or jsonb_array_length(d->'weekdays') not between 1 and 7 then raise exception 'Select weekdays'; end if;
  for v in select value from jsonb_array_elements(d->'weekdays') loop
   if jsonb_typeof(v)<>'number' or (v#>>'{}')::numeric not between 1 and 7 or (v#>>'{}')::numeric<>trunc((v#>>'{}')::numeric) then raise exception 'Invalid weekday'; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(d->'weekdays'))<>jsonb_array_length(d->'weekdays') then raise exception 'Duplicate weekday'; end if;
 end if;
 if d->>'mode'='interval' then
  if jsonb_typeof(d->'days') is distinct from 'number' or (d->>'days')::numeric not between 1 and 366 or (d->>'days')::numeric<>trunc((d->>'days')::numeric)
   or jsonb_typeof(d->'anchor') is distinct from 'string' or d->>'anchor' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid interval'; end if;
  perform (d->>'anchor')::date;
 end if;
 -- S7 will implement activation/DST/next_run; S5 never silently creates delivery jobs.
 new.next_run_at:=null;
 return new;
end $$;

create function public.set_s5_delivery_preferences(selected_rule uuid, delivery_preferences jsonb, rule_timezone text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or jsonb_typeof(delivery_preferences) is distinct from 'object' or rule_timezone is null or not public.valid_timezone(rule_timezone) then raise exception 'Invalid preference'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':rules',0));
 update public.rules set delivery_schedule=delivery_preferences||'{"active":false}'::jsonb,timezone=rule_timezone,next_run_at=null
 where id=selected_rule and user_id=auth.uid() and filters->>'scope'='s4';
 if not found then raise exception 'Rule not found' using errcode='42501'; end if;
end $$;
revoke all on function public.set_s5_delivery_preferences(uuid,jsonb,text) from public,anon;
grant execute on function public.set_s5_delivery_preferences(uuid,jsonb,text) to authenticated;
