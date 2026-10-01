-- Entire test is rolled back: synthetic probes are invisible to other sessions.
begin;
do $$
declare external text:='s3-tx-'||gen_random_uuid(); first jsonb; second jsonb;
 event uuid; v integer; captured timestamptz:=now(); total integer;
begin
 first:=jsonb_build_object('external_id',external,'hash',repeat('a',64),'title','S3 disposable transaction probe',
  'url','https://www.madrid.es/s3-test','category_code','music','locality','MADRID','occurrence',
  jsonb_build_object('external_id',external,'time_kind','known','start_at','2026-12-01T18:00:00Z','timezone','Europe/Madrid'));
 total:=public.ingest_madrid(jsonb_build_array(first),captured);
 if total<>1 then raise exception 'Import count'; end if;
 select o.event_id into event from public.source_records sr join public.event_sources es on es.source_record_id=sr.id join public.occurrences o on o.id=es.occurrence_id where sr.external_id=external;
 select version into v from public.events where id=event;
 perform public.ingest_madrid(jsonb_build_array(first),captured);
 if (select version from public.events where id=event)<>v then raise exception 'Unchanged import increments version'; end if;
 if (select count(*) from public.occurrences where event_id=event)<>1 then raise exception 'Duplicate occurrence'; end if;
 second:=jsonb_set(first,'{title}','"Changed normalized title"');
 perform public.ingest_madrid(jsonb_build_array(second),captured);
 if (select version from public.events where id=event)<>v+1 then raise exception 'Derived change did not increment version'; end if;
 second:=jsonb_set(second,'{occurrence,start_at}','"2026-12-01T19:00:00Z"');
 perform public.ingest_madrid(jsonb_build_array(second),captured);
 if (select version from public.events where id=event)<>v+2 then raise exception 'Time change did not increment version'; end if;
 begin
  perform public.ingest_madrid(jsonb_build_array(jsonb_set(second,'{title}','"Must roll back"'),jsonb_set(second,'{url}','"https://example.test/forbidden"')),captured);
  raise exception 'Expected invalid host rejection';
 exception when invalid_parameter_value then null;
 end;
 if (select title from public.events where id=event)<>'Changed normalized title' then raise exception 'Partial batch escaped rollback'; end if;
 if (select version from public.events where id=event)<>v+2 then raise exception 'Partial version escaped rollback'; end if;
 raise notice 'S3 transaction invariants passed: repeat identity/version, derived title/time updates, failed batch rollback';
end $$;
rollback;
