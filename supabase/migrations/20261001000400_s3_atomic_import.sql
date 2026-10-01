-- Server-only allowlisted import. The complete batch commits or rolls back.
create function public.ingest_madrid(batch jsonb, fetched_at timestamptz) returns integer
language plpgsql security definer set search_path='' as $$
declare source uuid; city uuid; row jsonb; record uuid; event uuid; occurrence uuid;
 old_hash text; changed boolean; imported integer:=0;
 source_url constant text:='https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information';
begin
 if jsonb_typeof(batch) is distinct from 'array' or jsonb_array_length(batch)>2000 or fetched_at is null
  or fetched_at>now()+interval '5 minutes' then raise exception 'Invalid batch' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(source_url,0));
 select id into source from public.sources where url=source_url and not is_demo order by id limit 1;
 if source is null then
  insert into public.sources(name,url,acquisition,terms_status,rights_reference,allow_cache,allow_translate,allow_images,poll_interval_seconds)
  values('Ayuntamiento de Madrid · CC BY 4.0',source_url,'api','allowed','https://datos.madrid.es/pages/condiciones-de-uso',true,true,false,86400) returning id into source;
 end if;
 if not exists(select 1 from public.sources where id=source and terms_status='allowed') then raise exception 'Source terms not allowed'; end if;
 select id into city from public.territories where external_id='madrid:municipio:Madrid' and not is_demo;
 for row in select value from jsonb_array_elements(batch) loop
  if row->>'external_id' is null or row->>'hash' !~ '^[a-f0-9]{64}$' or row->>'url' !~ '^https?://(www\.)?madrid\.es/'
    or row->'occurrence'->>'external_id' is distinct from row->>'external_id'
    or row->'occurrence'->>'timezone' is distinct from 'Europe/Madrid'
  then raise exception 'Invalid Madrid record' using errcode='22023'; end if;
  select id,payload_hash into record,old_hash from public.source_records where source_id=source and external_id=row->>'external_id';
  changed:=old_hash is distinct from row->>'hash';
  insert into public.source_records(source_id,external_id,payload_hash,fetched_at,canonical_url)
  values(source,row->>'external_id',row->>'hash',fetched_at,row->>'url')
  on conflict(source_id,external_id) do update set payload_hash=excluded.payload_hash,fetched_at=excluded.fetched_at,canonical_url=excluded.canonical_url
  returning id into record;
  select o.event_id into event from public.event_sources es join public.occurrences o on o.id=es.occurrence_id
   where es.source_record_id=record order by o.id limit 1;
  event:=coalesce(event,md5(source::text||':'||(row->>'external_id'))::uuid);
  insert into public.events(id,primary_source_id,canonical_url,checked_at,title,description,venue,category_code,territory_id,is_demo)
  values(event,source,row->>'url',fetched_at,row->>'title',row->>'description',row->>'venue',row->>'category_code',
    case when row->>'locality'='MADRID' then city else null end,false)
  on conflict(id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at,title=excluded.title,
   description=excluded.description,venue=excluded.venue,category_code=excluded.category_code,territory_id=excluded.territory_id,
   version=public.events.version+case when changed then 1 else 0 end;
  insert into public.occurrences(event_id,external_id,time_kind,start_at,local_date,timezone)
  values(event,row->>'external_id',row->'occurrence'->>'time_kind',(row->'occurrence'->>'start_at')::timestamptz,
    (row->'occurrence'->>'local_date')::date,'Europe/Madrid')
  on conflict(event_id,external_id) do update set time_kind=excluded.time_kind,start_at=excluded.start_at,local_date=excluded.local_date,timezone=excluded.timezone
  returning id into occurrence;
  insert into public.event_sources(occurrence_id,source_record_id,canonical_url,checked_at)
  values(occurrence,record,row->>'url',fetched_at)
  on conflict(occurrence_id,source_record_id) do update set canonical_url=excluded.canonical_url,checked_at=excluded.checked_at;
  imported:=imported+1;
 end loop;
 update public.sources set last_success_at=fetched_at where id=source;
 insert into public.ingestion_runs(source_id,started_at,finished_at,status,diagnostic)
 values(source,fetched_at,now(),'success',jsonb_build_object('imported',imported,'subset','single-day non-recurring'));
 return imported;
end $$;
revoke all on function public.ingest_madrid(jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.ingest_madrid(jsonb,timestamptz) to service_role;
