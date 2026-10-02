-- Direct event-detail reads must obey source terms too, not just the feed RPC.
-- Deliberately public, labelled S2 fixtures retain their catalog access.
drop policy catalog_read on public.events;
create policy permitted_event_read on public.events for select to anon,authenticated using(
 exists(select 1 from public.sources s where s.id=primary_source_id and
  (s.terms_status='allowed' or (s.terms_status='fixture' and s.is_demo and events.is_demo))));
drop policy catalog_read on public.occurrences;
create policy permitted_occurrence_read on public.occurrences for select to anon,authenticated using(
 exists(select 1 from public.events e where e.id=event_id));
drop policy catalog_read on public.event_sources;
create policy permitted_provenance_read on public.event_sources for select to anon,authenticated using(
 exists(select 1 from public.occurrences o where o.id=occurrence_id));
