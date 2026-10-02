-- Synthetic provider/model/costs, no network, all changes ROLLBACK.
begin;
do $$
declare src uuid; first_event uuid; second_event uuid; third_event uuid; r jsonb; again jsonb;
 job uuid; token uuid; before_total numeric; completed text; caught boolean; today date:=(now() at time zone 'UTC')::date;
 output jsonb:='{"title":"Synthetic translated title","description":"Synthetic translated description","summary":"Synthetic summary"}';
begin
 update public.s6_ai_settings set enabled=false;
 if public.reserve_s6_ai(gen_random_uuid(),'uk')->>'status'<>'disabled' then raise exception 'Default disabled path'; end if;
 insert into public.sources(name,url,acquisition,terms_status,allow_cache,allow_translate,last_success_at)
 values('S6 AI transaction fixture; not a real provider','https://fixture.invalid/','fixture','allowed',true,true,now()) returning id into src;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,description)
 values(src,'https://fixture.invalid/1',now(),'Original fixture one','Original text') returning id into first_event;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,description)
 values(src,'https://fixture.invalid/2',now(),'Original fixture two','Original text') returning id into second_event;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,description)
 values(src,'https://fixture.invalid/3',now(),'Original fixture three','Original text') returning id into third_event;
 -- Transaction-only budget baseline, independent of any existing operator ledger.
 delete from public.s6_ai_requests;
 delete from public.s6_ai_days;
 update public.s6_ai_settings set enabled=true,provider='fixture-provider',model_id='fixture-model-not-real',locales=array['uk','en','es'],
  currency='USD',daily_limit=1,request_ceiling=0.75,pricing_verified_at=now();
 r:=public.reserve_s6_ai(first_event,'uk');
 job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 if r->>'status'<>'reserved' then raise exception 'Reservation missing'; end if;
 again:=public.reserve_s6_ai(first_event,'uk');
 if again->>'status'<>'in_progress' or (again->>'request_id')::uuid<>job or again ? 'token' then raise exception 'Duplicate claim leaked token or spent again'; end if;
 if (select committed from public.s6_ai_days where day=today and currency='USD')<>0.75 then raise exception 'Duplicate reservation'; end if;
 if public.reserve_s6_ai(second_event,'uk')->>'status'<>'budget_exhausted' then raise exception 'Daily cap exceeded'; end if;
 if public.release_s6_ai(job,gen_random_uuid()) then raise exception 'Foreign token released budget'; end if;
 update public.s6_ai_settings set daily_limit=0.1,request_ceiling=0.1;
 if public.begin_s6_ai(job,token) is not null then raise exception 'Lowered cap ignored before dispatch'; end if;
 update public.s6_ai_settings set daily_limit=1,request_ceiling=0.75;
 insert into public.s6_ai_days(day,currency) values(today-1,'USD');
 update public.s6_ai_requests set budget_day=today-1 where id=job;
 if public.begin_s6_ai(job,token) is not null then raise exception 'Old-day reservation dispatched against a new daily cap'; end if;
 update public.s6_ai_requests set budget_day=today where id=job;
 if public.begin_s6_ai(job,token)->'source'->>'title'<>'Original fixture one' or public.begin_s6_ai(job,token) is not null then raise exception 'Dispatch was not once-only'; end if;
 if public.release_s6_ai(job,token) then raise exception 'Dispatched request refunded'; end if;
 caught:=false;begin perform public.finish_s6_ai(job,token,'ready',output||'{"price":0}',0.25);exception when others then caught:=true;end;
 if not caught then raise exception 'Normalized fact fields accepted from AI'; end if;
 completed:=public.finish_s6_ai(job,token,'ready',output,0.25);
 if completed<>'ready' or public.finish_s6_ai(job,token,'failed',null,0.9)<>'ready' then raise exception 'Completion not idempotent'; end if;
 if (select committed from public.s6_ai_days where day=today and currency='USD')<>0.25 then raise exception 'Double settlement'; end if;
 perform set_config('role','anon',true);
 if public.s6_translation(first_event,'uk')->>'title'<>'Synthetic translated title' then raise exception 'Ready current cache unavailable'; end if;
 caught:=false;begin perform 1 from public.s6_ai_days;exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'Private budget leaked'; end if;
 caught:=false;begin perform public.reserve_s6_ai(first_event,'uk');exception when insufficient_privilege then caught:=true;end;
 if not caught then raise exception 'Anon reserved budget'; end if;
 perform set_config('role','postgres',true);
 update public.s6_ai_settings set daily_limit=0.1,request_ceiling=0.1;
 if public.reserve_s6_ai(first_event,'uk')->>'status'<>'cached' then raise exception 'Cached repeat spent again under exhausted budget'; end if;
 update public.s6_ai_settings set daily_limit=1,request_ceiling=0.75;
 r:=public.reserve_s6_ai(second_event,'uk');job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 perform public.begin_s6_ai(job,token);
 if public.finish_s6_ai(job,token,'uncertain')<>'uncertain' then raise exception 'Ambiguous completion'; end if;
 if public.reserve_s6_ai(second_event,'uk')->>'status'<>'uncertain' or public.release_s6_ai(job,token)
  or (select committed from public.s6_ai_days where day=today and currency='USD')<>1 then raise exception 'Timeout automatically refunded/retried'; end if;
 if not exists(select 1 from public.s6_ai_requests where id=job and reported_cost is null and charge=ceiling)
 then raise exception 'Unknown provider cost presented as known'; end if;
 update public.s6_ai_settings set daily_limit=20;
 -- Safe cancellation before dispatch, also after a process restart/expired pre-dispatch lease.
 r:=public.reserve_s6_ai(third_event,'uk');job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 update public.s6_ai_requests set lease_until=now()-interval '1 second' where id=job;
 if public.begin_s6_ai(job,token) is not null or not public.release_s6_ai(job,token) or public.release_s6_ai(job,token)
 then raise exception 'Safe pre-dispatch release/expiry invalid'; end if;
 r:=public.reserve_s6_ai(third_event,'uk');
 if r->>'status'<>'reserved' or (r->>'token')::uuid=token then raise exception 'Released request did not obtain fresh claim'; end if;
 job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 before_total:=(select committed from public.s6_ai_days where day=today and currency='USD');
 perform public.begin_s6_ai(job,token);
 -- Simulate crossing UTC midnight: charge stays on reservation day, not completion day.
 update public.s6_ai_days set committed=0.75 where day=today-1 and currency='USD';
 update public.s6_ai_days set committed=committed-0.75 where day=today and currency='USD';
 update public.s6_ai_requests set budget_day=today-1 where id=job;
 perform public.finish_s6_ai(job,token,'failed',null,0.2000001);
 if (select committed from public.s6_ai_days where day=today-1 and currency='USD')<>0.200001
  or (select committed from public.s6_ai_days where day=today and currency='USD')<>before_total-0.75
  or (select reported_cost from public.s6_ai_requests where id=job)<>0.2000001 then raise exception 'Rollover/ceil/exact reported-cost accounting failed'; end if;
 -- Changed model hides older model output; unversioned source edits also invalidate input hash.
 update public.s6_ai_settings set model_id='different-fixture-model';
 perform set_config('role','anon',true);
 if public.s6_translation(first_event,'uk') is not null then raise exception 'Old model cache served'; end if;
 perform set_config('role','postgres',true);
 update public.s6_ai_settings set model_id='fixture-model-not-real';
 update public.events set description='Changed unversioned fixture text' where id=first_event;
 perform set_config('role','anon',true);
 if public.s6_translation(first_event,'uk') is not null then raise exception 'Wrong input cache served'; end if;
 perform set_config('role','postgres',true);
 r:=public.reserve_s6_ai(first_event,'uk');job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 perform public.begin_s6_ai(job,token);
 update public.events set version=version+1 where id=first_event;
 if public.finish_s6_ai(job,token,'ready',output,0.1)<>'superseded' then raise exception 'Late outdated result published'; end if;
 if exists(select 1 from public.events where id=first_event and (price is not null or event_language is not null or title<>'Original fixture one'))
 then raise exception 'AI changed normalized facts'; end if;
 -- Config changes/stale or blocked sources prevent dispatch even after a reservation.
 r:=public.reserve_s6_ai(first_event,'en');job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 update public.sources set terms_status='blocked' where id=src;
 if public.begin_s6_ai(job,token) is not null or public.reserve_s6_ai(first_event,'es')->>'status'<>'source_unavailable'
 then raise exception 'Blocked source sent to AI'; end if;
 perform public.release_s6_ai(job,token);update public.sources set terms_status='allowed' where id=src;
 update public.events set checked_at=now()-interval '49 hours' where id=first_event;
 if public.reserve_s6_ai(first_event,'es')->>'status'<>'stale' then raise exception 'Stale record enriched'; end if;
 update public.events set checked_at=now() where id=first_event;
 insert into public.translations(event_id,version,locale,provider,status,title,description)
 select id,version,'es','source:fixture','ready','Source fixture','Original provider text' from public.events where id=first_event;
 if public.reserve_s6_ai(first_event,'es')->>'status'<>'source_translation' then raise exception 'Native source cache spent AI'; end if;
 update public.s6_ai_settings set currency='EUR';
 if public.reserve_s6_ai(first_event,'en')->>'status'<>'currency_change_blocked' then raise exception 'Currency switch reset daily spend'; end if;
 update public.s6_ai_settings set currency='USD';
 -- Overrun is recorded truthfully rather than discarded; it blocks subsequent reservations at a lower cap.
 r:=public.reserve_s6_ai(first_event,'en');job:=(r->>'request_id')::uuid;token:=(r->>'token')::uuid;
 perform public.begin_s6_ai(job,token);perform public.finish_s6_ai(job,token,'failed',null,1.5);
 if not exists(select 1 from public.s6_ai_requests where id=job and overrun and charge=1.5) then raise exception 'Overrun hidden'; end if;
 update public.s6_ai_settings set daily_limit=0.75;
 if public.reserve_s6_ai(third_event,'es')->>'status'<>'budget_exhausted' then raise exception 'Overrun failed to block spending'; end if;
 update public.s6_ai_settings set enabled=false;
 perform set_config('role','anon',true);
 if public.s6_translation(first_event,'es')->>'title'<>'Source fixture' then raise exception 'Disabled AI blocked source cache'; end if;
 perform set_config('role','postgres',true);
 raise notice 'S6 AI foundation: disabled default, private RLS/RPC, same-key dedup, cap/lowered cap/new day, one dispatch, schema, idempotent settlement, conservative ambiguity vs known reported cost, safe pre-dispatch expiry, UTC day/ceil, model/input invalidation, superseded output, rights/freshness/native cache, currency switch, overrun: PASS (synthetic, AI calls=0)';
end $$;
rollback;
