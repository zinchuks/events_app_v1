-- Operator categorization shares persistent overlay/version/cache policy; no client catalog writes.
-- Serialize source imports and manual corrections using the existing source fence.
create or replace function public.correct_s8_occurrence(selected_occurrence uuid,patch jsonb,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare e uuid; source_url text; allowed text[]:=array['title','venue','price','currency','status','category_code','time_kind','start_at','end_at','local_date','timezone'];
begin
 if jsonb_typeof(patch) is distinct from 'object' or patch-allowed<>'{}'::jsonb or length(patch::text)>2000
 or (patch?'title' and (patch->>'title' is null or length(trim(patch->>'title')) not between 1 and 400))
 or (patch?'venue' and length(patch->>'venue')>400)
 or (patch?'category_code' and patch->>'category_code' is not null and not exists(select 1 from public.categories where code=patch->>'category_code'))
 or (patch?'status' and coalesce(patch->>'status','') not in ('scheduled','cancelled','review'))
 or reason is null or length(trim(reason)) not between 5 and 500 then raise exception 'Invalid correction'; end if;
 select o.event_id,s.url into e,source_url from public.occurrences o join public.events ev on ev.id=o.event_id join public.sources s on s.id=ev.primary_source_id where o.id=selected_occurrence;
 if e is null then raise exception 'Unknown occurrence'; end if;
 -- Same source lock/order as S6 importer: an in-flight import cannot read an old overlay and undo a correction.
 perform pg_advisory_xact_lock(hashtextextended(source_url,0));
 perform 1 from public.events where id=e for update;
 perform 1 from public.occurrences where id=selected_occurrence for update;
 patch:=coalesce((select c.patch from public.s8_corrections c where c.occurrence_id=selected_occurrence),'{}'::jsonb)||patch;
 insert into public.s8_corrections(occurrence_id,patch,reason) values(selected_occurrence,patch,reason)
 on conflict(occurrence_id) do update set patch=excluded.patch,reason=excluded.reason,updated_at=now();
 insert into public.s8_correction_log(occurrence_id,patch,reason) values(selected_occurrence,patch,reason);
 update public.events set title=case when patch?'title' then patch->>'title' else title end,
 category_code=case when patch?'category_code' then patch->>'category_code' else category_code end,
 venue=case when patch?'venue' then patch->>'venue' else venue end,
 price=case when patch?'price' then (patch->>'price')::numeric else price end,currency=case when patch?'currency' then patch->>'currency' else currency end,
 status=case when patch?'status' then patch->>'status' else status end,version=version+1 where id=e;
 update public.occurrences set time_kind=case when patch?'time_kind' then patch->>'time_kind' else time_kind end,
 start_at=case when patch?'start_at' then (patch->>'start_at')::timestamptz else start_at end,
 end_at=case when patch?'end_at' then (patch->>'end_at')::timestamptz else end_at end,
 local_date=case when patch?'local_date' then (patch->>'local_date')::date else local_date end,
 timezone=case when patch?'timezone' then patch->>'timezone' else timezone end,
 status=case when patch?'status' then patch->>'status' else status end where id=selected_occurrence;
end $$;

create or replace function public.s10_reset_override(selected_occurrence uuid,expected_version integer,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare source public.sources; baseline public.s10_provider_facts; previous jsonb; patch jsonb; o jsonb; version_number integer;
begin
 perform public.s10_require('editor');
 select s.* into source from public.occurrences oc join public.events e on e.id=oc.event_id join public.sources s on s.id=e.primary_source_id where oc.id=selected_occurrence;
 if source.id is null then raise exception 'Unknown occurrence'; end if;
 perform pg_advisory_xact_lock(hashtextextended(source.url,0));
 select e.version into version_number from public.events e join public.occurrences oc on oc.event_id=e.id where oc.id=selected_occurrence for update of e,oc;
 if version_number is distinct from expected_version then raise exception 'Event revision conflict' using errcode='40001'; end if;
 select * into baseline from public.s10_provider_facts where occurrence_id=selected_occurrence;
 if baseline.occurrence_id is null or baseline.checked_at+make_interval(secs=>source.freshness_seconds)<=now() or source.terms_status<>'allowed' or not source.allow_cache then raise exception 'Fresh provider baseline required; import before removing override'; end if;
 previous:=public.s10_event(selected_occurrence);
 o:=baseline.record->'occurrences'->0;
 patch:=jsonb_build_object('title',baseline.record->>'title','venue',baseline.record->>'venue','price',baseline.record->'price','currency',baseline.record->>'currency',
 'category_code',baseline.record->>'category_code','status',coalesce(baseline.record->>'status','scheduled'),'time_kind',o->>'time_kind','start_at',o->>'start_at','end_at',o->>'end_at','local_date',o->>'local_date','timezone',o->>'timezone');
 perform public.s10_correct(selected_occurrence,expected_version,patch,reason);
 delete from public.s8_corrections where occurrence_id=selected_occurrence;
 insert into public.s10_audit(actor,action,target,reason,before_state,after_state) values(auth.uid(),'override_reset',selected_occurrence,reason,previous,public.s10_event(selected_occurrence));
end $$;

-- Account deletion removes role identifiers while retaining public-event operational history.
create function public.s10_delete_profile_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.s10_audit set target=null,before_state=before_state-'user_id',after_state=after_state-'user_id'
 where action='operator_role' and target=old.id;
 return old;
end $$;
revoke all on function public.s10_delete_profile_audit() from public,anon,authenticated;
create trigger s10_delete_profile_audit before delete on public.profiles for each row execute function public.s10_delete_profile_audit();
