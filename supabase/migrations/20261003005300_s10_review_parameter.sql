drop function public.s10_review_duplicate(uuid,uuid,uuid,integer,integer,text);
create function public.s10_review_duplicate(left_id uuid,right_id uuid,chosen_canonical uuid,left_version integer,right_version integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare source_url text; previous jsonb; duplicate_id uuid;
begin
 perform public.s10_require('editor');
 if reason is null or length(trim(reason)) not between 5 and 500 or left_id is null or right_id is null or left_id>=right_id
 or (chosen_canonical is not null and chosen_canonical not in (left_id,right_id)) then raise exception 'Invalid review'; end if;
 perform pg_advisory_xact_lock(hashtextextended('s10:merge',0));
 for source_url in select distinct s.url from public.occurrences o join public.events e on e.id=o.event_id join public.sources s on s.id=e.primary_source_id where o.id in (left_id,right_id) order by s.url loop
  perform pg_advisory_xact_lock(hashtextextended(source_url,0));
 end loop;
 perform 1 from public.events e join public.occurrences o on o.event_id=e.id where o.id in(left_id,right_id) order by e.id for update of e;
 perform 1 from public.occurrences where id in(left_id,right_id) order by id for update;
 select to_jsonb(d) into previous from public.duplicate_candidates d where left_occurrence=left_id and right_occurrence=right_id for update;
 if previous is null then raise exception 'Unknown duplicate candidate'; end if;
 if left_version is distinct from (select e.version from public.events e join public.occurrences o on o.event_id=e.id where o.id=left_id)
 or right_version is distinct from (select e.version from public.events e join public.occurrences o on o.event_id=e.id where o.id=right_id) then raise exception 'Duplicate revision conflict' using errcode='40001'; end if;
 if chosen_canonical is not null then
  if public.s10_same_session(left_id,right_id) is distinct from true then raise exception 'Session facts differ: correct or mark distinct'; end if;
  duplicate_id:=case when chosen_canonical=left_id then right_id else left_id end;
  if exists(select 1 from public.s10_merges where occurrence_id=chosen_canonical or s10_merges.canonical_id=duplicate_id or occurrence_id=duplicate_id) then raise exception 'Existing merge: undo it first; no chains'; end if;
  insert into public.s10_merges(occurrence_id,canonical_id) values(duplicate_id,chosen_canonical);
 else
  delete from public.s10_merges where (occurrence_id=left_id and s10_merges.canonical_id=right_id) or (occurrence_id=right_id and s10_merges.canonical_id=left_id);
 end if;
 update public.duplicate_candidates set status=case when chosen_canonical is null then 'distinct' else 'duplicate' end where left_occurrence=left_id and right_occurrence=right_id;
 insert into public.s10_audit(actor,action,target,reason,before_state,after_state) values(auth.uid(),'duplicate_review',coalesce(chosen_canonical,left_id),reason,previous,jsonb_build_object('left',left_id,'right',right_id,'canonical',chosen_canonical));
end $$;
grant execute on function public.s10_review_duplicate(uuid,uuid,uuid,integer,integer,text) to authenticated,service_role;
revoke all on function public.s10_review_duplicate(uuid,uuid,uuid,integer,integer,text) from public,anon;
