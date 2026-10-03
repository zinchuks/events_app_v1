-- Offline CI deterministic fixtures in one transaction. No real map/source proof.
begin;
create function pg_temp.check(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'S5 FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
do $$
declare uid uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); src uuid:=gen_random_uuid(); e uuid; occ uuid; zero_occ uuid; city uuid; doc jsonb; r uuid; result jsonb; p1 jsonb; p2 jsonb; d jsonb; n integer;
begin
 insert into auth.users(id,email) values(uid,'s5-sql-fixture@example.test'),(stranger,'s5-sql-stranger@example.test');
 -- Synthetic Plus for advanced-filter regression, transaction-only; never a real store purchase.
 insert into public.s9_config(id,enabled,entitlement_id,product_ids,app_ids) values(true,true,'synthetic-plus',array['synthetic-month'],array['synthetic-app'])
 on conflict(id) do update set enabled=true,entitlement_id=excluded.entitlement_id,product_ids=excluded.product_ids,app_ids=excluded.app_ids;
 insert into public.entitlements(user_id,tier,expires_at,verified_at,provider_observed_at,provider_reference,environment)
 values(uid,'plus',now()+interval '2 days',now(),now(),'revenuecat','SANDBOX');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select id into city from public.territories where external_id='madrid:municipio:Madrid';
 insert into public.sources(id,name,url,acquisition,terms_status,last_success_at) values(src,'S5 transaction-only fixture','https://example.test/s5','fixture','allowed',now());
 for n in 1..4 loop
  insert into public.events(primary_source_id,canonical_url,checked_at,title,description,category_code,territory_id,location)
  values(src,'https://example.test/s5/'||n,now(),'S5tx searchable fixture '||n,'description-token Ω','music',city,case when n=1 then extensions.st_setsrid(extensions.st_makepoint(0,0),4326)::extensions.geography end) returning id into e;
  insert into public.occurrences(event_id,external_id,time_kind,local_date,timezone) values(e,'s5tx','date_only',current_date+1,'Europe/Madrid') returning id into occ;
  if n=1 then zero_occ:=occ; end if;
 end loop;
 result:=public.list_s5_events('catalog','S5tx',0,30);
 perform pg_temp.check((result->>'total')::integer=4,'public catalog search count');
 perform pg_temp.check((result->>'mapped')::integer=1,'known zero coordinates count');
 perform pg_temp.check(jsonb_array_length(result->'items')=4,'all requested rows');
 perform pg_temp.check(public.list_s5_events('catalog','description-token Ω',0,30)->>'total'='4','description and Unicode search');
 perform pg_temp.check(public.list_s5_events('catalog','%_',0,30)->>'total'='0','literal wildcard characters');
 p1:=public.list_s5_events('catalog','S5tx',0,2);p2:=public.list_s5_events('catalog','S5tx',2,2);
 perform pg_temp.check(p1=public.list_s5_events('catalog','S5tx',0,2),'stable ordered page');
 perform pg_temp.check(jsonb_array_length(p1->'items')=2 and jsonb_array_length(p2->'items')=2,'page sizes');
 perform pg_temp.check(not exists(select 1 from jsonb_array_elements(p1->'items') a join jsonb_array_elements(p2->'items') b on a->>'id'=b->>'id'),'pages do not overlap');
 perform pg_temp.check(public.s5_event_coordinates(zero_occ)='{"longitude":0,"latitude":0}'::jsonb,'zero is genuine location, not unknown');
 perform pg_temp.check(public.s5_event_coordinates(occ) is null,'unknown location stays null');
 doc:=jsonb_build_object('name','S5 tx','enabled',true,'timezone','Europe/Madrid','event_horizon','{"kind":"days","days":30}'::jsonb,'filters','{"scope":"s4","categories":["music"],"languages":[],"include_unknown_language":true,"include_unknown_price":true,"include_unknown_age":true}'::jsonb,'areas',jsonb_build_array(jsonb_build_object('kind','city','territory_id',city)));
 r:=public.save_s5_rule(doc,'{"mode":"interval","time":"18:00","days":7,"anchor":"2026-10-02"}');
 perform pg_temp.check(public.list_s5_events('matches','S5tx',0,30)->>'total'='4','owner union matches fixtures');
 perform pg_temp.check((select delivery_schedule->>'active'='false' and next_run_at is null and event_horizon->>'days'='30' from public.rules where id=r),'preferences inactive and horizon independent');
 perform pg_temp.check(not exists(select 1 from public.notification_jobs where user_id=uid),'onboarding creates no push jobs');
 perform public.set_s5_delivery_preferences(r,'{"mode":"weekdays","time":"19:30","weekdays":[1,7]}','America/Toronto');
 perform pg_temp.check((select timezone='America/Toronto' and event_horizon->>'days'='30' and next_run_at is null from public.rules where id=r),'timezone preference preserves event horizon');
 perform set_config('request.jwt.claim.sub',stranger::text,true);
 perform pg_temp.check(public.list_s5_events('matches','S5tx',0,30)->>'total'='0','stranger sees no owner matches');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 foreach d in array array['{}'::jsonb,'{"mode":null}','{"mode":"daily","time":"24:00"}','{"mode":"weekdays","time":"18:00","weekdays":[]}','{"mode":"interval","time":"18:00","days":7,"anchor":"2026-02-30"}'] loop
  begin perform public.save_s5_rule(doc,d);raise exception 'S5 FAIL: invalid preferences accepted';exception when others then
   if sqlerrm like 'S5 FAIL:%' then raise;end if;raise notice 'PASS: invalid preference rejected atomically';end;
 end loop;
 perform pg_temp.check((select count(*)=1 from public.rules where user_id=uid),'failed onboarding leaves no rule');
 perform public.set_s4_rule_enabled(r,false);perform pg_temp.check(public.list_s5_events('matches','S5tx',0,30)->>'total'='0','paused rule hidden from feed');
 update public.sources set terms_status='blocked' where id=src;
 perform pg_temp.check(public.list_s5_events('catalog','S5tx',0,30)->>'total'='0','rights blocked source excluded');
 update public.sources set terms_status='allowed',is_demo=true where id=src;
 perform pg_temp.check(public.list_s5_events('catalog','S5tx',0,30)->>'total'='0','demo source excluded');
end $$;
rollback;
