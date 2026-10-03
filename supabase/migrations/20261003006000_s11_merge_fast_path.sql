-- Avoid repeated private merge probes for ordinary unmerged events, measured on 100k synthetic rows.
create or replace function public.s7_matches(selected_owner uuid,selected_rules uuid[],matching_clock timestamptz)
returns table(occurrence_id uuid,rule_id uuid) language sql stable security definer set search_path='' as $$
 with raw as materialized (select m.*,case when link.occurrence_id is null then m.occurrence_id else public.s10_group(m.occurrence_id) end as group_id from public.s10_previous_matches(selected_owner,selected_rules,matching_clock) m left join public.s10_merges link on link.occurrence_id=m.occurrence_id),
 representatives as (select distinct on(group_id) group_id,raw.occurrence_id from raw order by group_id,(raw.occurrence_id=group_id) desc,raw.occurrence_id)
 select distinct p.occurrence_id,r.rule_id from raw r join representatives p using(group_id)
$$;
create or replace function public.list_s5_events(view_mode text default 'catalog', search_text text default '', page_offset integer default 0, page_size integer default 30)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if view_mode is null or search_text is null or page_offset is null or page_size is null or view_mode not in ('catalog','matches') or length(search_text)>120 or page_offset not between 0 and 10000 or page_size not between 1 and 1000 then raise exception 'Invalid catalog request'; end if;
 if view_mode='matches' and auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 with matches as (
  select occurrence_id,array_agg(distinct rule_id order by rule_id) rules
  from public.s4_matches() where view_mode='matches' group by occurrence_id
 ), raw_eligible as (
  select o.id,o.event_id,o.time_kind,o.start_at,o.local_date,o.timezone,e.title,e.venue,e.category_code,e.checked_at,
   coalesce(m.rules,array[]::uuid[]) as matched_rules,
   case when e.location is not null then extensions.st_x(e.location::extensions.geometry) end as longitude,
   case when e.location is not null then extensions.st_y(e.location::extensions.geometry) end as latitude,
   coalesce(o.local_date,(o.start_at at time zone o.timezone)::date) as sort_date,
   case when link.occurrence_id is null then o.id else public.s10_group(o.id) end as group_id
  from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id
  left join matches m on m.occurrence_id=o.id left join public.s10_merges link on link.occurrence_id=o.id
  where not e.is_demo and not s.is_demo and s.terms_status='allowed' and e.status='scheduled' and o.status='scheduled'
   and (view_mode='catalog' or m.occurrence_id is not null)
   and ((o.time_kind='known' and o.start_at>=now()) or (o.time_kind='date_only' and o.local_date>=(now() at time zone coalesce(o.timezone,'UTC'))::date))
   and (trim(search_text)='' or strpos(lower(e.title||' '||coalesce(e.venue,'')||' '||coalesce(e.description,'')),lower(trim(search_text)))>0)
 ), eligible as (select distinct on(group_id) * from raw_eligible order by group_id,(id=group_id) desc,id), page as (select * from eligible order by sort_date,start_at nulls last,id limit page_size offset page_offset)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p)-'sort_date'-'group_id' order by p.sort_date,p.start_at nulls last,p.id) from page p),'[]'::jsonb),
  'total',(select count(*) from eligible),'mapped',(select count(*) from eligible where longitude is not null and latitude is not null)) into result;
 return result;
end $$;
