begin;
do $$
declare uid uuid:=gen_random_uuid(); country bigint:=900000000001; region bigint:=900000000002; village bigint:=900000000003;
 result jsonb; first_id uuid; again_id uuid; n integer:=0;
begin
 insert into auth.users(id,email) values(uid,'TEST-places@fixture.invalid');
 insert into public.place_catalog(geoname_id,kind,feature_code,country_code,name,names,latitude,longitude,population,admin_path,parent_geoname_id,search_text,modified_on)
 values(country,'country','PCLI','ZZ','TEST Country','{"und":"TEST Country"}',1,2,0,'{}',null,'test country zz',current_date),
 (region,'admin','ADM1','ZZ','TEST Region','{"und":"TEST Region"}',1,2,0,'{01}',country,'test region zz',current_date),
 (village,'city','PPL','ZZ','TEST Hameau','{"und":"TEST Hameau","uk":"TEST Село"}',1,2,0,'{01}',region,'test hameau test село 東京 zz',current_date);
 perform set_config('request.jwt.claim.sub',uid::text,true);
 result:=public.search_places('TEST Село','city','uk','ZZ',0);
 if jsonb_array_length(result->'items')<>1 or result->'items'->0->>'region'<>'TEST Region' or (result->'items'->0->>'has_boundary')::boolean then raise exception 'Search/region/boundary facts wrong';end if;n:=n+1;
 result:=public.search_places('東京','city','uk','ZZ',0);if jsonb_array_length(result->'items')<>1 then raise exception 'Two-character alias prefix missing';end if;n:=n+1;
 result:=public.search_places('%','city','uk','ZZ',0);
 if jsonb_array_length(result->'items')<>0 then raise exception 'Wildcard not escaped';end if;n:=n+1;
 result:=public.search_places('%%','city','uk','ZZ',0);
 if jsonb_array_length(result->'items')<>0 then raise exception 'Wildcard not escaped';end if;n:=n+1;
 begin perform public.search_places('test','city','uk',null,-1);raise exception 'Accepted offset';exception when sqlstate '22023' then null;end;n:=n+1;
 begin perform public.search_places('test','village','uk',null,0);raise exception 'Accepted invalid kind';exception when sqlstate '22023' then null;end;n:=n+1;
 begin perform public.resolve_place('geonames:abc');raise exception 'Accepted invalid key';exception when others then if sqlerrm='Accepted invalid key' then raise;end if;end;n:=n+1;
 result:=public.resolve_place('geonames:'||village);first_id:=(result->>'territory_id')::uuid;
 if first_id is null or (result->>'has_boundary')::boolean or result->>'feature_code'<>'PPL' then raise exception 'Resolution invented facts';end if;n:=n+1;
 if not exists(select 1 from public.territories t join public.territories p on p.id=t.parent_id join public.territories c on c.id=p.parent_id where t.id=first_id and p.geoname_id=region and c.geoname_id=country) then raise exception 'Parent hierarchy missing';end if;n:=n+1;
 again_id:=(public.resolve_place('geonames:'||village)->>'territory_id')::uuid;
 if again_id<>first_id then raise exception 'Unstable identity';end if;n:=n+1;
 if jsonb_array_length(public.search_places('TEST Село','city','uk','ZZ',0)->'items')<>1 then raise exception 'Materialized duplicate search row';end if;n:=n+1;
 update public.territories set center=null where id=first_id;
 result:=public.resolve_place('territory:'||first_id);
 if (result->>'latitude')::numeric<>1 or (result->>'longitude')::numeric<>2 or exists(select 1 from public.territories where id=first_id and center is not null) then raise exception 'Missing linked source point or altered reviewed territory';end if;n:=n+1;
 update public.place_catalog set active=false where geoname_id=village;
 begin perform public.resolve_place('geonames:'||village);raise exception 'Accepted inactive place';exception when others then if sqlerrm='Accepted inactive place' then raise;end if;end;n:=n+1;
 if not exists(select 1 from public.territories where id=first_id) then raise exception 'Old territory removed';end if;n:=n+1;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.resolve_place('geonames:'||region);raise exception 'Anonymous resolution accepted';exception when sqlstate '42501' then null;end;n:=n+1;
 if has_table_privilege('anon','public.place_catalog','select') or has_table_privilege('authenticated','public.place_catalog','insert') or has_function_privilege('anon','public.resolve_place(text)','execute') then raise exception 'Catalog privilege leak';end if;n:=n+1;
 raise notice 'PASS places SQL invariants: %',n;
end $$;
rollback;
