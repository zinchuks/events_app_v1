-- Explicit synthetic records, transaction-only; no account resets or AI/push calls.
begin;
do $$
declare claim uuid; repeated uuid; batch jsonb; row jsonb; e uuid; occ uuid; v integer; n integer;
 before_health timestamptz; caught boolean; hel uuid; alternate uuid; alt_event uuid; alt_occ uuid; other_occ uuid; uid uuid:=gen_random_uuid();
begin
 if exists((select name from pg_catalog.pg_timezone_names except select name from public.timezone_names)
  union all (select name from public.timezone_names except select name from pg_catalog.pg_timezone_names)) then raise exception 'Timezone inventory mismatch'; end if;
 if public.valid_timezone('fixture/invalid') or not public.valid_timezone('Europe/Madrid') then raise exception 'Timezone validity'; end if;
 claim:=public.claim_s6_source('madrid',true);
 if claim is null or public.claim_s6_source('madrid',true) is not null then raise exception 'Single source lease required'; end if;
 select last_success_at into before_health from public.sources where code='madrid';
 row:=jsonb_build_object('external_id','fixture-s6-session','hash',repeat('a',64),'title','S6 SQL fixture','description','Synthetic original',
  'url','https://www.madrid.es/fixture-s6','category_code','music','territory','madrid:municipio:Madrid','location','[-3.7,40.4]'::jsonb,
  'price',0,'currency','EUR','occurrences',jsonb_build_array(jsonb_build_object('external_id','fixture-s6-session','time_kind','known','timezone','Europe/Madrid','start_at',now()+interval '5 days')),
  'translations',jsonb_build_array(jsonb_build_object('locale','en','title','S6 translation fixture','description','Synthetic provider translation','summary','Fixture summary')));
 batch:=jsonb_build_array(row);
 -- All-or-nothing: invalid second record must roll back the first and source health.
 caught:=false;
 begin perform public.ingest_s6_source('madrid',batch||jsonb_build_array(row||'{"external_id":"bad","url":"https://evil.invalid/"}'),now(),claim,'{}');
 exception when others then caught:=true; end;
 if not caught or exists(select 1 from public.source_records where external_id='fixture-s6-session') then raise exception 'Atomic rollback failed'; end if;
 if (select last_success_at from public.sources where code='madrid') is distinct from before_health then raise exception 'Failed import marked healthy'; end if;
 caught:=false;
 begin perform public.ingest_s6_source('madrid','[]',now(),claim,'{}'); exception when others then caught:=true; end;
 if not caught then raise exception 'Empty batch accepted'; end if;
 n:=public.ingest_s6_source('madrid',batch,now(),claim,'{"bounded_subset":true}');
 if n<>1 then raise exception 'Expected one import'; end if;
 select o.event_id,o.id,e0.version into e,occ,v from public.occurrences o join public.events e0 on e0.id=o.event_id where o.external_id='fixture-s6-session';
 if v<>1 then raise exception 'Initial version'; end if;
 if public.claim_s6_source('madrid',false) is not null then raise exception 'Poll cadence ignored'; end if;
 claim:=public.claim_s6_source('madrid',true);
 perform public.ingest_s6_source('madrid',batch,now(),claim,'{}');
 if (select version from public.events where id=e)<>1 or (select id from public.occurrences where event_id=e and external_id='fixture-s6-session')<>occ then raise exception 'Repeat changed version/identity'; end if;
 claim:=public.claim_s6_source('madrid',true);
 perform public.ingest_s6_source('madrid',jsonb_build_array(row||'{"price":2}'),now(),claim,'{}');
 if (select version from public.events where id=e)<>2 then raise exception 'Changed facts with unchanged hash did not invalidate version'; end if;
 perform set_config('role','anon',true);
 if (select count(*) from public.translations where event_id=e)<>1 then raise exception 'Stale translation public'; end if;
 if public.s6_translation(e,'en')->>'version'<>'2' then raise exception 'Current translation selection'; end if;
 perform set_config('role','postgres',true);
 claim:=public.claim_s6_source('madrid',true);
 perform public.ingest_s6_source('madrid',jsonb_build_array((row-'translations')||'{"price":3}'),now(),claim,'{}');
 perform set_config('role','anon',true);
 if public.s6_translation(e,'en') is not null then raise exception 'Outdated translation reused'; end if;
 caught:=false;begin perform public.claim_s6_source('madrid',true);exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'Anon claimed source'; end if;
 caught:=false;begin perform 1 from public.source_poll_state;exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'Poll state leaked'; end if;
 perform set_config('role','postgres',true);
 claim:=public.claim_s6_source('madrid',true);perform public.fail_s6_source('madrid',claim,'fetch_failed');
 if not exists(select 1 from public.source_poll_state p join public.sources s on s.id=p.source_id where s.code='madrid' and failures=1 and next_poll_at>=now()+interval '4 minutes' and token is null) then raise exception 'Backoff not recorded'; end if;
 if public.claim_s6_source('madrid',false) is not null then raise exception 'Backoff ignored'; end if;
 -- A second independently identified source: same session can be a review candidate.
 insert into public.sources(name,url,acquisition,terms_status,allow_cache,allow_translate)
 values('S6 synthetic transaction fixture','https://fixture.invalid/','fixture','allowed',true,true) returning id into alternate;
 select id into hel from public.territories where external_id='catalog:city:FI:Helsinki';
 insert into public.events(primary_source_id,canonical_url,checked_at,title,description,venue,category_code,territory_id,location)
 values(alternate,'https://fixture.invalid/',now(),'S6 duplicate fixture','Synthetic','Fixture venue','music',hel,
  extensions.st_setsrid(extensions.st_makepoint(24.93,60.17),4326)::extensions.geography) returning id into alt_event;
 insert into public.occurrences(event_id,external_id,time_kind,start_at,timezone) values(alt_event,'fixture-a','known',now()+interval '10 days','Europe/Helsinki') returning id into alt_occ;
 insert into public.occurrences(event_id,external_id,time_kind,start_at,timezone) values(alt_event,'fixture-b','known',now()+interval '11 days','Europe/Helsinki') returning id into other_occ;
 row:=row||jsonb_build_object('external_id','fixture:helsinki','url','https://api.hel.fi/linkedevents/v1/event/fixture:helsinki/',
  'title','S6 duplicate fixture','venue','Fixture venue','territory','catalog:city:FI:Helsinki','location','[24.93,60.17]'::jsonb,
  'occurrences',jsonb_build_array(jsonb_build_object('external_id','fixture:helsinki','time_kind','known','timezone','Europe/Helsinki','start_at',now()+interval '10 days')));
 claim:=public.claim_s6_source('helsinki',true);perform public.ingest_s6_source('helsinki',jsonb_build_array(row),now(),claim,'{}');
 if not exists(select 1 from public.duplicate_candidates where left_occurrence=alt_occ or right_occurrence=alt_occ) then raise exception 'Exact same session candidate missing'; end if;
 if exists(select 1 from public.duplicate_candidates where left_occurrence=other_occ or right_occurrence=other_occ) then raise exception 'Different sessions conflated'; end if;
 if (select count(*) from public.occurrences where id in(alt_occ,other_occ))<>2 then raise exception 'Candidate automatically merged'; end if;
 update public.sources set terms_status='blocked' where code='madrid';
 perform set_config('role','anon',true);
 if exists(select 1 from public.events where id=e) or exists(select 1 from public.occurrences where id=occ) then raise exception 'Blocked source details still public'; end if;
 perform set_config('role','postgres',true);
 update public.sources set terms_status='allowed' where code='madrid';
 insert into auth.users(id,email) values(uid,'s6-transaction-fixture@example.test');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.save_s4_rule(jsonb_build_object('name','S6 TTL fixture','enabled',true,'timezone','Europe/Helsinki',
  'filters','{"scope":"s4","categories":["music"],"languages":[],"include_unknown_language":true,"include_unknown_price":true,"include_unknown_age":true}'::jsonb,
  'event_horizon','{"kind":"days","days":30}'::jsonb,'areas',jsonb_build_array(jsonb_build_object('kind','city','territory_id',hel))));
 update public.sources set last_success_at=now()-interval '13 hours' where code='helsinki';
 caught:=false;begin perform public.build_rule_digest();exception when others then caught:=position('stale' in sqlerrm)>0;end;
 if not caught then raise exception 'Helsinki 12h TTL ignored by digest'; end if;
 select o.event_id,o.id into e,occ from public.occurrences o where external_id='fixture:helsinki';
 select version into v from public.events where id=e;
 claim:=public.claim_s6_source('helsinki',true);
 perform public.ingest_s6_source('helsinki',jsonb_build_array(row||'{"status":"cancelled"}'),now(),claim,'{}');
 if not exists(select 1 from public.events where id=e and status='cancelled' and version=v+1)
  or not exists(select 1 from public.occurrences where id=occ and event_id=e and status='cancelled') then raise exception 'Explicit cancellation did not preserve occurrence identity/version'; end if;
 raise notice 'S6 invariants: timezone parity, atomic rollback, nonempty health, leases/cadence/backoff, stable IDs/versions, changed-fact invalidation, current-cache RLS, blocked-source detail RLS, source TTL digest, anon denial, exact-session review without merging: PASS';
end $$;
rollback;
