-- Serialize source imports and manual corrections using the existing source fence.
create or replace function public.correct_s8_occurrence(selected_occurrence uuid,patch jsonb,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare e uuid; source_url text; allowed text[]:=array['title','venue','price','currency','status','time_kind','start_at','end_at','local_date','timezone'];
begin
 if jsonb_typeof(patch) is distinct from 'object' or patch-allowed<>'{}'::jsonb or length(patch::text)>2000
 or (patch?'title' and (patch->>'title' is null or length(trim(patch->>'title')) not between 1 and 400))
 or (patch?'venue' and length(patch->>'venue')>400)
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
