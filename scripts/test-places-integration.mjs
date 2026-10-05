// Real local API search with full GeoNames data; disposable Auth only, no owner changes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { localClients } from './lib/local-clients.mjs';
const {admin,client}=localClients({timeoutMs:15000});const anon=client();let uid;let checks=0;const timings=[];
const ok=r=>{assert.equal(r.error,null,r.error?.message);checks++;return r.data;};
const check=v=>{assert.ok(v);checks++;};
try{
 const first=ok(await anon.rpc('search_places'));check(first.items.length===25&&first.has_more);
 const second=ok(await anon.rpc('search_places',{page_offset:25}));check(second.items.length===25);check(!second.items.some(p=>first.items.some(q=>q.key===p.key)));
 for(const [query,country] of [['Київ','UA'],['Kiev','UA'],['São Paulo','BR'],['東京',null],['Londres','GB'],['Верховина','UA'],['Zermatt','CH']]){
  const started=performance.now();const page=ok(await anon.rpc('search_places',{query_text:query,country}));timings.push({query,country,api_ms:Math.round(performance.now()-started),returned:page.items.length});
  check(page.items.length>0&&page.items.length<=25&&page.items.every(p=>(country===null||p.country_code===country)));
  check(page.items.every(p=>p.names&&p.provenance));
  if(query==='Київ'){const kyiv=page.items.find(p=>p.geoname_id===703448);check(kyiv&&Number.isFinite(kyiv.latitude)&&Number.isFinite(kyiv.longitude));}
 }
 for(const locale of ['uk','en','es'])check(ok(await anon.rpc('search_places',{query_text:'Madrid',locale,country:'ES'})).items.some(p=>p.territory_id));
 check(ok(await anon.rpc('search_places',{query_text:'nonesuch-place-'+randomUUID()})).items.length===0);
 check(Boolean((await anon.rpc('search_places',{page_offset:-1})).error));
 check(Boolean((await anon.from('place_catalog').select('*')).error));
 check(Boolean((await anon.rpc('resolve_place',{place_key:'geonames:703448'})).error));
 const email='places-'+randomUUID()+'@example.test';const password=randomUUID()+'Aa1!';
 const user=ok(await admin.auth.admin.createUser({email,password,email_confirm:true}));uid=user.user.id;
 const own=client();ok(await own.auth.signInWithPassword({email,password}));
 const madrid=ok(await own.rpc('resolve_place',{place_key:'geonames:3117735'}));check(Boolean(madrid.territory_id));
 check(ok(await own.rpc('resolve_place',{place_key:'geonames:3117735'})).territory_id===madrid.territory_id);
 check(ok(await anon.rpc('search_places',{query_text:'Madrid',country:'ES'})).items.filter(p=>p.geoname_id===3117735).length===1);
 const country=ok(await own.rpc('resolve_place',{place_key:'geonames:2510769'}));check(country.kind==='country'&&country.country_code==='ES');
 check(Boolean((await own.from('place_catalog').insert({geoname_id:1})).error));
 check(ok(await own.from('rules').select('id')).length===0);
 console.log(JSON.stringify({checks,actual_auth_api:true,full_catalog_required:true,timings,native_verified:false,owner_rules_mutated:false}));
}finally{if(uid){const r=await admin.auth.admin.deleteUser(uid);assert.equal(r.error,null);}console.log(JSON.stringify({own_test_user_removed:true}));}
