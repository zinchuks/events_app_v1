-- Choose a fresh eligible duplicate before the partial-freshness digest selection.
create or replace function public.s7_matches(selected_owner uuid,selected_rules uuid[],matching_clock timestamptz)
returns table(occurrence_id uuid,rule_id uuid) language sql stable security definer set search_path='' as $$
 with raw as materialized (select m.*,coalesce(s.last_success_at>=matching_clock-pg_catalog.make_interval(secs=>s.freshness_seconds) and e.checked_at>=matching_clock-pg_catalog.make_interval(secs=>s.freshness_seconds),false) as current,case when link.occurrence_id is null then m.occurrence_id else public.s10_group(m.occurrence_id) end as group_id from public.s10_previous_matches(selected_owner,selected_rules,matching_clock) m join public.occurrences o on o.id=m.occurrence_id join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id left join public.s10_merges link on link.occurrence_id=m.occurrence_id),
 representatives as (select distinct on(group_id) group_id,raw.occurrence_id from raw order by group_id,raw.current desc,(raw.occurrence_id=group_id) desc,raw.occurrence_id)
 select distinct p.occurrence_id,r.rule_id from raw r join representatives p using(group_id)
$$;

drop policy own_s11_metrics on public.s11_metrics;
create policy own_s11_metrics on public.s11_metrics for select to authenticated using(user_id=auth.uid() and day>=(now() at time zone 'UTC')::date-29);
