-- Deterministic PostGIS/filter tests in ONE rolled-back transaction. These labelled
-- fixtures are never visible to another transaction and are not live-source proof.
begin;
create function pg_temp.check(value boolean,label text) returns void language plpgsql as $$ begin
 if value is distinct from true then raise exception 'S4 FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end $$;
create function pg_temp.denied(document jsonb,label text) returns void language plpgsql as $$ begin
 begin perform public.save_s4_rule(document); exception when others then raise notice 'PASS: rejected %',label; return; end;
 raise exception 'S4 FAIL: accepted %',label;
end $$;
do $$
declare uid uuid:=gen_random_uuid(); source uuid:=gen_random_uuid(); madrid uuid; es uuid; ua uuid; fr uuid; region uuid;
 inside uuid; edge uuid; outside uuid; unknown_location uuid; ukraine uuid; france uuid;
 r uuid; r2 uuid; d uuid; doc jsonb; polygon jsonb; radius jsonb; countries jsonb; boundary_distance double precision; vertices jsonb; known_occurrence uuid;
begin
 insert into auth.users(id,email) values(uid,'s4-sql-fixture@example.test');
 -- Synthetic Plus for advanced-filter regression, transaction-only; never a real store purchase.
 insert into public.s9_config(id,enabled,entitlement_id,product_ids,app_ids) values(true,true,'synthetic-plus',array['synthetic-month'],array['synthetic-app'])
 on conflict(id) do update set enabled=true,entitlement_id=excluded.entitlement_id,product_ids=excluded.product_ids,app_ids=excluded.app_ids;
 insert into public.entitlements(user_id,tier,expires_at,verified_at,provider_observed_at,provider_reference,environment)
 values(uid,'plus',now()+interval '2 days',now(),now(),'revenuecat','SANDBOX');
 perform set_config('request.jwt.claim.sub',uid::text,true);
 select id into madrid from public.territories where external_id='madrid:municipio:Madrid';
 select id into es from public.territories where external_id='iso3166:ES';
 select id into ua from public.territories where external_id='iso3166:UA';
 select id into fr from public.territories where external_id='iso3166:FR';
 select id into region from public.territories where external_id='geoboundaries:25490228B43154843394848';
 perform pg_temp.check((select count(*)=19 and bool_and(extensions.st_isvalid(boundary)) from public.territories where kind='admin' and external_id like 'geoboundaries:%'),'19 licensed admin boundaries valid');
 perform pg_temp.check((select extensions.st_covers(boundary,extensions.st_setsrid(extensions.st_makepoint(-3.7,40.42),4326)) from public.territories where id=region),'real Madrid boundary includes city point');
 perform pg_temp.check((select not extensions.st_covers(boundary,extensions.st_setsrid(extensions.st_makepoint(2.17,41.38),4326)) from public.territories where id=region),'real Madrid boundary excludes Barcelona point');
 insert into public.sources(id,name,url,acquisition,terms_status,last_success_at) values(source,'S4 transaction-only fixture','https://example.test/s4','fixture','allowed',now());
 -- Isolate deterministic geometry/date assertions from the expanding live catalog.
 -- Transaction-only change is invisible to concurrent readers and always ROLLBACK.
 update public.sources set terms_status='blocked' where id<>source;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,category_code,location,price,currency,event_language,age_min,age_max)
 values(source,'https://example.test/s4/inside',now(),'S4 fixture inside','music',extensions.st_setsrid(extensions.st_makepoint(-3.5,40.5),4326),10,'EUR','es',6,12) returning id into inside;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,category_code,location,price,currency,event_language,age_min,age_max)
 values(source,'https://example.test/s4/edge',now(),'S4 fixture edge','culture',extensions.st_setsrid(extensions.st_makepoint(-4,40.5),4326),10,'USD','en',18,30) returning id into edge;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,category_code,location)
 values(source,'https://example.test/s4/outside',now(),'S4 fixture outside','sport',extensions.st_setsrid(extensions.st_makepoint(-5,40.5),4326)) returning id into outside;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,category_code,territory_id)
 values(source,'https://example.test/s4/unknown',now(),'S4 fixture unknown','music',madrid) returning id into unknown_location;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,category_code,territory_id)
 values(source,'https://example.test/s4/ua',now(),'S4 fixture Ukraine','culture',ua) returning id into ukraine;
 insert into public.events(primary_source_id,canonical_url,checked_at,title,category_code,territory_id)
 values(source,'https://example.test/s4/fr',now(),'S4 fixture France','sport',fr) returning id into france;
 update public.events set territory_id=es where id in(inside,edge,outside);
 insert into public.occurrences(event_id,external_id,time_kind,local_date) select id,'s4-fixture','date_only',current_date+1 from public.events where primary_source_id=source;
 countries:=jsonb_build_array(jsonb_build_object('kind','country','territory_id',es,'parameters','{}'::jsonb),jsonb_build_object('kind','country','territory_id',ua,'parameters','{}'::jsonb));
 polygon:='[{"kind":"polygon","parameters":{"points":[[-4,40],[-3,40],[-3,41],[-4,41]]}}]';
 doc:=jsonb_build_object('name','S4 transaction fixture','enabled',true,'timezone','UTC','event_horizon',jsonb_build_object('kind','days','days',30),
  'filters','{"scope":"s4","categories":[],"languages":[],"include_unknown_language":true,"include_unknown_price":true,"include_unknown_age":true,"price_min":null,"price_max":null,"currency":null,"age_min":null,"age_max":null}'::jsonb,'areas',polygon);
 r:=public.save_s4_rule(doc);
 perform pg_temp.check((select count(*)=2 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id in(inside,edge,outside,unknown_location)),'polygon includes inside AND boundary; excludes outside AND unknown coordinates');
 doc:=jsonb_set(doc,'{areas}',countries);perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'country membership without coordinates via verified hierarchy');
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=ukraine) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=france),'country OR includes Ukraine; excludes France');
 doc:=jsonb_set(doc,'{filters,categories}','["music","culture"]');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside) and exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=edge) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=outside),'category OR; spatial AND categories');
 doc:=jsonb_set(doc,'{areas}',jsonb_build_array(jsonb_build_object('kind','admin','territory_id',region)));perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside) and exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'admin matching uses real boundary OR child hierarchy');
 update public.events set territory_id=null,category_code='music',location=(select extensions.st_pointn(extensions.st_exteriorring(extensions.st_geometryn(boundary,1)),1)::extensions.geography from public.territories where id=region) where id=outside;
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=outside),'point ON real licensed admin boundary included');
 update public.events set territory_id=es,category_code='sport',location=extensions.st_setsrid(extensions.st_makepoint(-5,40.5),4326) where id=outside;
 doc:=jsonb_set(doc,'{areas}',polygon); doc:=jsonb_set(doc,'{filters,categories}','[]');perform public.save_s4_rule(doc,r);
 doc:=jsonb_set(doc,'{filters,price_max}','15'); doc:=jsonb_set(doc,'{filters,currency}','"EUR"');doc:=jsonb_set(doc,'{filters,include_unknown_price}','false');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=edge),'EUR budget never compares USD price');
 doc:=jsonb_set(doc,'{areas}',countries);doc:=jsonb_set(doc,'{filters,include_unknown_price}','true');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'unknown price explicitly allowed');
 doc:=jsonb_set(doc,'{filters,include_unknown_price}','false');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'unknown price explicitly excluded');
 doc:=jsonb_set(doc,'{filters,price_max}','null');doc:=jsonb_set(doc,'{filters,currency}','null');doc:=jsonb_set(doc,'{filters,languages}','["es"]');doc:=jsonb_set(doc,'{filters,include_unknown_language}','false');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=edge) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'language AND other groups; known mismatch/unknown excluded');
 doc:=jsonb_set(doc,'{filters,include_unknown_language}','true');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'unknown language explicitly allowed');
 doc:=jsonb_set(doc,'{filters,languages}','[]');doc:=jsonb_set(doc,'{filters,age_min}','10');doc:=jsonb_set(doc,'{filters,age_max}','15');doc:=jsonb_set(doc,'{filters,include_unknown_age}','false');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=edge) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'age overlap and unknown-age exclusion');
 doc:=jsonb_set(doc,'{filters,include_unknown_age}','true');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'unknown age explicitly allowed');
 doc:=jsonb_set(doc,'{filters,age_min}','null');doc:=jsonb_set(doc,'{filters,age_max}','null');
 select extensions.st_distance(extensions.st_setsrid(extensions.st_makepoint(-3.5,40.5),4326)::extensions.geography,location) into boundary_distance from public.events where id=edge;
 radius:=jsonb_build_array(jsonb_build_object('kind','radius','parameters',jsonb_build_object('longitude',-3.5,'latitude',40.5,'meters',boundary_distance)));
 doc:=jsonb_set(doc,'{areas}',radius);perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside) and exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=edge) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=outside) and not exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=unknown_location),'radius uses geodesic meters; includes boundary; excludes outside/unknown');
 doc:=jsonb_set(doc,'{areas}',polygon);doc:=jsonb_set(doc,'{event_horizon}',jsonb_build_object('kind','range','start',current_date+1,'end',current_date+1));perform public.save_s4_rule(doc,r);
 perform pg_temp.check((select count(*)=2 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id in(inside,edge)),'inclusive explicit date range includes date-only events');
 doc:=jsonb_set(doc,'{event_horizon}',jsonb_build_object('kind','range','start',current_date+2,'end',current_date+2));perform public.save_s4_rule(doc,r);
 perform pg_temp.check((select count(*)=0 from public.s4_matches(r)),'date range excludes other dates');
 doc:=jsonb_set(doc,'{event_horizon}',jsonb_build_object('kind','days','days',30));perform public.save_s4_rule(doc,r);r2:=public.save_s4_rule(doc);
 perform pg_temp.check((select cardinality(matched_rules)=2 from public.list_rule_events() where event_id=inside),'overlapping rules return ONE card with both rule IDs');
 d:=public.build_rule_digest();perform pg_temp.check(d=public.build_rule_digest(),'manual union digest idempotent');
 perform pg_temp.check((select count(*)=2 from public.digest_items where digest_id=d),'manual union digest deduplicated');
 perform pg_temp.check(not exists(select 1 from public.notification_jobs where digest_id=d),'S4 manual digest does not silently schedule push');
 update public.rules set enabled=false where id=r2;perform pg_temp.check((select cardinality(matched_rules)=1 from public.list_rule_events() where event_id=inside),'paused rule excluded');
 delete from public.rules where id=r2;perform pg_temp.check(not exists(select 1 from public.rule_areas where rule_id=r2),'delete rule cascades private areas');
 perform pg_temp.check((select count(*)=2 from public.digest_items where digest_id=d),'delete rule preserves saved digest');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"polygon","parameters":{"points":[[0,0],[1,1],[0,1],[1,0]]}}]'),'self-intersection');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"polygon","parameters":{"points":[[179,0],[-179,0],[-179,1]]}}]'),'antimeridian');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"polygon","parameters":{"points":[[0,0],[1,0],[2,0]]}}]'),'collinear zero-area');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"polygon","parameters":{"points":[[0,0],[1,0]]}}]'),'less than 3 vertices');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"polygon","parameters":{"points":[[0,0],[1,0],[0,1],[0,0]]}}]'),'closing duplicate');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"polygon","parameters":{"points":[[0,91],[1,0],[0,1]]}}]'),'out-of-range coordinates');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"radius","parameters":{"longitude":0,"latitude":0,"meters":0}}]'),'zero radius');
 perform pg_temp.denied(jsonb_set(doc,'{areas}','[{"kind":"radius","parameters":{"longitude":0,"latitude":0,"meters":500001}}]'),'oversized radius');
 perform pg_temp.denied(jsonb_set(doc,'{areas}',jsonb_build_array(jsonb_build_object('kind','country','territory_id',madrid))),'territory-kind mismatch');
 perform pg_temp.denied(jsonb_set(doc,'{filters,categories}','["fake"]'),'invalid category');
 perform pg_temp.denied(jsonb_set(doc,'{filters,languages}','["Spanish"]'),'invalid language');
 perform pg_temp.denied(jsonb_set(doc,'{filters,price_max}','10'),'budget without currency');
 perform pg_temp.denied(jsonb_set(doc,'{event_horizon}','{"kind":"days","days":0}'),'zero days');
 perform pg_temp.denied(jsonb_set(doc,'{event_horizon}','{"kind":"range","start":"2026-02-30","end":"2026-03-01"}'),'invalid calendar date');
 perform pg_temp.denied(jsonb_set(doc,'{timezone}','"Invalid/Timezone"'),'invalid timezone');
 perform pg_temp.denied(jsonb_set(doc,'{name}','{}'),'non-string name');
 -- Real country boundary also works when the event has coordinates but no
 -- assigned territory. Do not infer city membership from a source label.
 update public.events set territory_id=null where id=inside;
 perform public.save_s4_rule(jsonb_set(doc,'{areas}',countries),r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) m join public.occurrences o on o.id=m.occurrence_id where o.event_id=inside),'licensed country boundary matches unassigned point');
 select jsonb_agg(jsonb_build_array(cos(n*2*pi()/100),sin(n*2*pi()/100)) order by n) into vertices from generate_series(0,99) n;
 perform public.save_s4_rule(jsonb_set(doc,'{areas}',jsonb_build_array(jsonb_build_object('kind','polygon','parameters',jsonb_build_object('points',vertices)))),r);
 perform pg_temp.check((select extensions.st_npoints(a.polygon)=101 from public.rule_areas a where a.rule_id=r),'100 vertices accepted; server closes ring');
 select jsonb_agg(jsonb_build_array(cos(n*2*pi()/101),sin(n*2*pi()/101)) order by n) into vertices from generate_series(0,100) n;
 perform pg_temp.denied(jsonb_set(doc,'{areas}',jsonb_build_array(jsonb_build_object('kind','polygon','parameters',jsonb_build_object('points',vertices)))),'more than 100 vertices');
 insert into public.occurrences(event_id,external_id,time_kind,start_at,timezone) values(inside,'s4-known-time','known',((current_date+2)::timestamp+interval '30 minutes') at time zone 'UTC','UTC') returning id into known_occurrence;
 doc:=jsonb_set(doc,'{timezone}','"America/Los_Angeles"');doc:=jsonb_set(doc,'{event_horizon}',jsonb_build_object('kind','range','start',current_date+1,'end',current_date+1));
 perform public.save_s4_rule(doc,r);
 perform pg_temp.check(exists(select 1 from public.s4_matches(r) where occurrence_id=known_occurrence),'known UTC timestamp filtered by local rule date (previous day)');
 doc:=jsonb_set(doc,'{timezone}','"UTC"');perform public.save_s4_rule(doc,r);
 perform pg_temp.check(not exists(select 1 from public.s4_matches(r) where occurrence_id=known_occurrence),'same timestamp outside UTC date range');
 update public.sources set last_success_at=now()-interval '3 days' where id=source;
 begin perform public.build_rule_digest();raise exception 'S4 FAIL: stale digest accepted';exception when others then
  if sqlerrm not like '%Source data is stale%' then raise;end if;raise notice 'PASS: stale source blocks new manual digest';end;
 perform pg_temp.check((select count(*)=1 from public.rules where user_id=uid),'invalid saves leave no partial rules');
end $$;
rollback;
