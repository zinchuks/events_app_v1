-- Only in the S11 disposable schema clone. Explicit synthetic fixtures + ROLLBACK.
begin;
create function pg_temp.s11_check(value boolean) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'S11 partial freshness invariant failed'; end if;
 perform set_config('eventradar.s11_checks',(coalesce(nullif(current_setting('eventradar.s11_checks',true),''),'0')::integer+1)::text,true);
end $$;
do $$
declare owner uuid:=gen_random_uuid(); city uuid:=gen_random_uuid(); source uuid:=gen_random_uuid(); old_source uuid:=gen_random_uuid();
 fresh_event uuid:=gen_random_uuid(); stale_event uuid:=gen_random_uuid(); source_event uuid:=gen_random_uuid();
 fresh_occ uuid:=gen_random_uuid(); stale_occ uuid:=gen_random_uuid(); source_occ uuid:=gen_random_uuid(); rule uuid; digest uuid; new_digest uuid; result jsonb; caught boolean:=false;
 document jsonb; prefs jsonb;
begin
 caught:=false;begin perform public.verify_s11_staging('synthetic-stage.supabase.co');exception when insufficient_privilege then caught:=true;end;
 perform pg_temp.s11_check(caught);
 insert into public.s11_runtime(id,environment,api_host) values(true,'staging','synthetic-stage.supabase.co') on conflict(id) do update set environment=excluded.environment,api_host=excluded.api_host;
 perform public.verify_s11_staging('synthetic-stage.supabase.co');
 perform pg_temp.s11_check(not has_function_privilege('authenticated','public.verify_s11_staging(text)','execute') and not has_table_privilege('authenticated','public.s11_runtime','select'));
 caught:=false;begin perform public.verify_s11_staging('other.supabase.co');exception when insufficient_privilege then caught:=true;end;
 perform pg_temp.s11_check(caught);
 insert into auth.users(id,email) values(owner,'synthetic-s11-freshness@fixture.invalid');
 insert into public.territories(id,country_code,external_id,kind,names,provenance) values(city,'ES','synthetic-s11-city','city','{"en":"SYNTHETIC city"}','Explicit S11 synthetic fixture');
 insert into public.sources(id,name,url,acquisition,terms_status,allow_cache,last_success_at,freshness_seconds) values
 (source,'SYNTHETIC fresh source','https://fixture.invalid/s11/fresh','api','allowed',true,now(),3600),
 (old_source,'SYNTHETIC stale source','https://fixture.invalid/s11/stale','api','allowed',true,now()-interval '2 hours',3600);
 insert into public.events(id,primary_source_id,canonical_url,checked_at,title,territory_id) values
 (fresh_event,source,'https://fixture.invalid/s11/fresh',now(),'SYNTHETIC fresh event',city),
 (stale_event,source,'https://fixture.invalid/s11/old',now()-interval '2 hours','SYNTHETIC expired record',city),
 (source_event,old_source,'https://fixture.invalid/s11/source',now(),'SYNTHETIC expired source',city);
 insert into public.occurrences(id,event_id,external_id,time_kind,start_at,timezone) values
 (fresh_occ,fresh_event,'fresh','known',now()+interval '1 day','UTC'),
 (stale_occ,stale_event,'old','known',now()+interval '1 day','UTC'),
 (source_occ,source_event,'source','known',now()+interval '1 day','UTC');
 perform set_config('request.jwt.claim.sub',owner::text,true);
 document:=jsonb_build_object('name','SYNTHETIC S11 rule','enabled',true,'timezone','UTC',
 'filters','{"scope":"s4","categories":[],"languages":[],"include_unknown_language":true,"include_unknown_price":true,"include_unknown_age":true}'::jsonb,
 'event_horizon','{"kind":"days","days":30}'::jsonb,'areas',jsonb_build_array(jsonb_build_object('kind','city','territory_id',city,'parameters','{}'::jsonb)));
 rule:=public.save_s7_rule(document,'{"mode":"manual","time":"18:00","active":false}');
 perform pg_temp.s11_check((public.list_s5_events('matches')->>'total')::integer=3);
 digest:=public.build_rule_digest();
 perform pg_temp.s11_check((select count(*)=1 and bool_and(occurrence_id=fresh_occ) from public.digest_items where digest_id=digest));
 perform pg_temp.s11_check((select stale_excluded=2 from public.digests where id=digest));
 perform pg_temp.s11_check(public.build_rule_digest()=digest);
 perform pg_temp.s11_check((select matched_rule_names=array['SYNTHETIC S11 rule'] and selection_snapshot->>'title'='SYNTHETIC fresh event' from public.digest_items where digest_id=digest));
 perform set_config('timezone','Europe/Helsinki',true);
 perform pg_temp.s11_check(public.build_rule_digest()=digest);
 update public.events set title='SYNTHETIC updated title',version=version+1 where id=fresh_event;
 new_digest:=public.build_rule_digest();
 perform pg_temp.s11_check(new_digest<>digest and (select selection_snapshot->>'title'='SYNTHETIC updated title' from public.digest_items where digest_id=new_digest));
 perform pg_temp.s11_check((select selection_snapshot->>'title'='SYNTHETIC fresh event' from public.digest_items where digest_id=digest));
 perform set_config('timezone','UTC',true);
 perform pg_temp.s11_check((select count(*)=3 from public.occurrences where id in(fresh_occ,stale_occ,source_occ)));
 prefs:=jsonb_build_object('mode','weekdays','time','18:00','weekdays',jsonb_build_array(extract(isodow from now() at time zone 'UTC')::integer),'active',true);
 perform public.save_s7_rule(document,prefs,rule);
 update public.rules set next_run_at=now()-interval '1 minute' where id=rule;
 result:=public.run_s7_scheduler();
 perform pg_temp.s11_check(result->>'status'='ready' and result->>'items'='1' and result->>'stale_excluded'='2');
 perform pg_temp.s11_check((select count(*)=1 and bool_and(occurrence_id=fresh_occ) from public.digest_items where digest_id=(result->>'digest_id')::uuid));
 update public.events set checked_at=now()-interval '2 hours' where id=fresh_event;
 begin perform public.build_rule_digest();exception when others then caught:=SQLERRM='Source data is stale';end;
 perform pg_temp.s11_check(caught);
 update public.rules set next_run_at=now()-interval '1 minute',schedule_retry_at=null where id=rule;
 result:=public.run_s7_scheduler();
 perform pg_temp.s11_check(result->>'status'='stale' and result->>'items'='0');
 perform pg_temp.s11_check((select next_run_at<=now() and schedule_retry_at>now() from public.rules where id=rule));
 update public.rules set enabled=false where id=rule;
 perform pg_temp.s11_check(public.build_rule_digest() is null);
 -- A stale canonical must not discard its fresh eligible duplicate.
 update public.events set checked_at=now() where id=fresh_event;
 update public.events set title='SYNTHETIC shared session',location=extensions.st_setsrid(extensions.st_makepoint(-3.7,40.42),4326)::extensions.geography where id in(fresh_event,stale_event);
 insert into public.s10_merges(occurrence_id,canonical_id) values(fresh_occ,stale_occ);
 update public.rules set enabled=true where id=rule;
 perform pg_temp.s11_check(public.s10_same_session(fresh_occ,stale_occ));
 digest:=public.build_rule_digest();
 perform pg_temp.s11_check((select count(*)=1 and bool_and(occurrence_id=fresh_occ) from public.digest_items where digest_id=digest));
end $$;
select jsonb_build_object('invariant_checks',current_setting('eventradar.s11_checks')::integer);
rollback;
