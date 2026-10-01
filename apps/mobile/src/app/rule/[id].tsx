import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Field, Toggle } from '@/components/rule-fields';
import { AreaMap } from '@/components/area-map';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { emptyFilters, label, optionalNumber, type Area, type Filters, type Territory, type Point } from '@/lib/rules';
import type { Json } from '@/lib/database.types';
export default function RuleEditor(){
 const{id}=useLocalSearchParams<{id:string}>();const{session,loading}=useAuth();const{t,locale}=useLanguage();
 const[name,setName]=useState('');const[enabled,setEnabled]=useState(true);const[filters,setFilters]=useState<Filters>({...emptyFilters});const[areas,setAreas]=useState<Area[]>([]);const[territories,setTerritories]=useState<Territory[]>([]);const[categories,setCategories]=useState<{code:string;names:Json}[]>([]);const[state,setState]=useState('loading');const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 const[kind,setKind]=useState<Area['kind']>('city');const[search,setSearch]=useState('');const[shown,setShown]=useState(12);const[points,setPoints]=useState<Point[]>([]);const[lon,setLon]=useState('');const[lat,setLat]=useState('');const[km,setKm]=useState('10');
 const[priceMin,setPriceMin]=useState('');const[priceMax,setPriceMax]=useState('');const[currency,setCurrency]=useState('');const[languages,setLanguages]=useState('');const[ageMin,setAgeMin]=useState('');const[ageMax,setAgeMax]=useState('');
 const[dateMode,setDateMode]=useState<'days'|'range'>('days');const[days,setDays]=useState('30');const[start,setStart]=useState('');const[end,setEnd]=useState('');const[timezone,setTimezone]=useState('Europe/Madrid');
 useEffect(()=>{let active=true;setMessage('');setState('loading');setAreas([]);setFilters({...emptyFilters});setName('');setEnabled(true);setPoints([]);
  if(!session||!supabase){setState('ready');return;}const client=supabase;
  void (async()=>{
   const[cats,ts]=await Promise.all([client.from('categories').select('code,names').order('code'),client.from('territories').select('id,kind,names,country_code,provenance').eq('is_demo',false).order('country_code')]);
   if(cats.error||ts.error)throw Error('Catalog unavailable');if(!active)return;setCategories(cats.data);setTerritories(ts.data);
   if(id!=='new'){
    const{data,error}=await client.from('rules').select('*,rule_areas(kind,territory_id,parameters)').eq('id',id).eq('user_id',session.user.id).eq('filters->>scope','s4').single();
    if(error)throw error;if(!active)return;const f={...emptyFilters,...(data.filters as unknown as Filters)};const h=data.event_horizon as Record<string,Json>;
    setName(data.name);setEnabled(data.enabled);setFilters(f);setAreas(data.rule_areas as unknown as Area[]);setTimezone(data.timezone);
    setPriceMin(f.price_min===null?'':String(f.price_min));setPriceMax(f.price_max===null?'':String(f.price_max));setCurrency(f.currency??'');setLanguages(f.languages.join(', '));setAgeMin(f.age_min===null?'':String(f.age_min));setAgeMax(f.age_max===null?'':String(f.age_max));
    setDateMode(h.kind==='range'?'range':'days');setDays(String(h.days??30));setStart(String(h.start??''));setEnd(String(h.end??''));
   } else {setPriceMin('');setPriceMax('');setCurrency('');setLanguages('');setAgeMin('');setAgeMax('');setDateMode('days');setDays('30');setStart('');setEnd('');setTimezone('Europe/Madrid');}
   if(active)setState('ready');
  })().catch(()=>{if(active)setState('error');});return()=>{active=false;};
 },[id,session?.user.id]);
 const disabled=busy||state!=='ready';
 function report(error:unknown){const m=error&&typeof error==='object'&&'message'in error?String(error.message):'';setMessage(m.includes('Antimeridian')?t('antimeridianError'):m.includes('Polygon')||m.includes('polygon')||m.includes('vertex')?t('polygonError'):t('ruleValidationError'));}
 function addArea(area:Area){if(areas.length>=20){setMessage(t('areaLimit'));return;}if(!areas.some(a=>JSON.stringify(a)===JSON.stringify(area)))setAreas(a=>[...a,area]);setMessage('');setPoints([]);}
 function addPoint(p:Point){if(kind==='radius')setPoints([p]);else if(points.length<100)setPoints(ps=>[...ps,p]);else setMessage(t('polygonError'));}
 async function save(){if(!supabase||!session||disabled)return;setMessage('');setBusy(true);
  try{
   const f:Filters={...filters,languages:[...new Set(languages.split(',').map(s=>s.trim()).filter(Boolean))],price_min:optionalNumber(priceMin),price_max:optionalNumber(priceMax),currency:currency.trim().toUpperCase()||null,age_min:optionalNumber(ageMin),age_max:optionalNumber(ageMax)};
   if(!name.trim()||areas.length===0)throw Error('Invalid rule');
   const event_horizon=dateMode==='days'?{kind:'days',days:optionalNumber(days)}:{kind:'range',start:start.trim(),end:end.trim()};
   const document={name:name.trim(),enabled,filters:f,event_horizon,timezone:timezone.trim(),areas:areas.map(a=>({kind:a.kind,parameters:a.parameters,territory_id:a.territory_id??null}))};
   const{error}=await supabase.rpc('save_s4_rule',{rule_document:document,selected_rule:id==='new'?undefined:id});if(error)throw error;router.replace('/rules');
  }catch(error){report(error);}finally{setBusy(false);}
 }
 const choices=territories.filter(v=>v.kind===kind && (label(v.names,locale)+' '+v.country_code).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>label(a.names,locale).localeCompare(label(b.names,locale)));
 const areaName=(a:Area)=>a.kind==='radius'?`${t('radius')}: ${a.parameters.longitude}, ${a.parameters.latitude} · ${a.parameters.meters/1000} km`:a.kind==='polygon'?`${t('polygon')}: ${a.parameters.points.length} ${t('vertices')}`:label(territories.find(v=>v.id===a.territory_id)?.names??{},locale);
 return <Screen title={id==='new'?t('newRule'):t('editRule')}>{loading||state==='loading'?<Text>{t('loading')}</Text>:!session?<Button label={t('signInForRule')} onPress={()=>router.push('/account')}/>:state==='error'?<Text accessibilityRole="alert">{t('ruleUnavailable')}</Text>:<>
  <View style={ui.card}><Field label={t('ruleName')} value={name} onChange={setName} disabled={disabled}/><Toggle label={t('activeRule')} value={enabled} onChange={setEnabled} disabled={disabled}/><Text style={ui.muted}>{t('rulesHint')}</Text></View>
  <View style={ui.card}><Text style={ui.title}>{t('ruleAreas')}</Text><Text style={ui.muted}>{t('areasHint')}</Text><Text style={ui.muted}>{t('s4Coverage')}</Text>
   {areas.map((a,i)=><View key={i} style={{gap:6}}><Text style={ui.text}>{areaName(a)}</Text><View style={ui.row}><Button size="sm" variant="link" label={t('removeArea')} disabled={disabled} onPress={()=>setAreas(as=>as.filter((_,n)=>n!==i))}/>{(a.kind==='radius'||a.kind==='polygon')&&<Button size="sm" variant="link" label={t('editArea')} disabled={disabled} onPress={()=>{setKind(a.kind);setPoints(a.kind==='polygon'?a.parameters.points:[[a.parameters.longitude,a.parameters.latitude]]);if(a.kind==='radius')setKm(String(a.parameters.meters/1000));setAreas(as=>as.filter((_,n)=>n!==i));}}/>}</View></View>)}
   <View style={ui.row}>{(['country','admin','city','radius','polygon']as const).map(value=><Button key={value} size="sm" label={t(value)} disabled={disabled} variant={kind===value?'default':'outline'} onPress={()=>{setKind(value);setSearch('');setShown(12);setPoints([]);}}/>)}</View>
   {kind==='country'||kind==='admin'||kind==='city'?<>
    <Field label={t('searchTerritories')} value={search} onChange={v=>{setSearch(v);setShown(12);}} disabled={disabled}/>
    <View style={ui.row}>{choices.slice(0,shown).map(v=><Button key={v.id} size="sm" label={`${label(v.names,locale)} · ${v.country_code}`} disabled={disabled||areas.some(a=>a.territory_id===v.id)} variant="outline" onPress={()=>addArea({kind:v.kind as 'city'|'country'|'admin',territory_id:v.id,parameters:{}})}/>)}</View>
    {choices.length===0&&<Text style={ui.text}>{t('noTerritories')}</Text>}{shown<choices.length&&<Button size="sm" label={t('moreTerritories')} variant="link" onPress={()=>setShown(v=>v+12)}/>}
   </>:<>
    <AreaMap points={points} onPoint={addPoint} meters={kind==='radius'?Number(km.replace(',','.'))*1000:undefined} disabled={disabled}/>
    <Field label={t('longitude')} value={lon} onChange={setLon} disabled={disabled} numeric/><Field label={t('latitude')} value={lat} onChange={setLat} disabled={disabled} numeric/>
    <Button size="sm" variant="outline" label={t('addPoint')} disabled={disabled} onPress={()=>{try{const x=optionalNumber(lon),y=optionalNumber(lat);if(x===null||y===null||Math.abs(x)>180||Math.abs(y)>90)throw Error('Invalid coordinate');addPoint([x,y]);setLon('');setLat('');setMessage('');}catch(error){report(error);}}}/>
    <Text style={ui.muted}>{points.map((p,i)=>`${i+1}: ${p[0]}, ${p[1]}`).join(' · ')||t('noPoints')}</Text>
    <Button size="sm" variant="link" label={t('undoPoint')} disabled={disabled||points.length===0} onPress={()=>setPoints(ps=>ps.slice(0,-1))}/>
    {kind==='radius'&&<Field label={t('radiusKm')} value={km} onChange={setKm} disabled={disabled} numeric/>}
    <Text style={ui.muted}>{t('geometryHint')}</Text><Button label={t('addArea')} variant="outline" disabled={disabled || points.length<(kind==='radius'?1:3)} onPress={()=>{try{if(kind==='radius'){const meters=optionalNumber(km);if(meters===null||meters<=0)throw Error('Invalid radius');addArea({kind:'radius',parameters:{longitude:points[0][0],latitude:points[0][1],meters:meters*1000}});}else addArea({kind:'polygon',parameters:{points}});}catch(error){report(error);}}}/>
   </>}
  </View>
  <View style={ui.card}><Text style={ui.title}>{t('yourInterests')}</Text><Text style={ui.muted}>{t('categoryHint')}</Text><View style={ui.row}><Button size="sm" label={t('allCategories')} disabled={disabled} variant={filters.categories.length===0?'default':'outline'} onPress={()=>setFilters(f=>({...f,categories:[]}))}/>{categories.map(cat=><Button key={cat.code} size="sm" label={label(cat.names,locale)} variant={filters.categories.includes(cat.code)?'default':'outline'} disabled={disabled} onPress={()=>setFilters(f=>({...f,categories:f.categories.includes(cat.code)?f.categories.filter(c=>c!==cat.code):[...f.categories,cat.code]}))}/>)}</View></View>
  <View style={ui.card}><Text style={ui.title}>{t('eventDates')}</Text><View style={ui.row}><Button label={t('nextDays')} variant={dateMode==='days'?'default':'outline'} disabled={disabled} onPress={()=>setDateMode('days')}/><Button label={t('dateRange')} variant={dateMode==='range'?'default':'outline'} disabled={disabled} onPress={()=>setDateMode('range')}/></View>{dateMode==='days'?<Field label={t('numberOfDays')} value={days} onChange={setDays} disabled={disabled} numeric/>:<><Field label={t('startDate')} value={start} onChange={setStart} disabled={disabled}/><Field label={t('endDate')} value={end} onChange={setEnd} disabled={disabled}/></>}<Field label={t('ruleTimezone')} value={timezone} onChange={setTimezone} disabled={disabled}/><Text style={ui.muted}>{t('dateHint')}</Text></View>
  <View style={ui.card}><Text style={ui.title}>{t('budget')}</Text><Field label={t('minimumPrice')} value={priceMin} onChange={setPriceMin} disabled={disabled} numeric/><Field label={t('maximumPrice')} value={priceMax} onChange={setPriceMax} disabled={disabled} numeric/><Field label={t('currencyCode')} value={currency} onChange={setCurrency} disabled={disabled}/><Toggle label={t('allowUnknownPrice')} value={filters.include_unknown_price} onChange={v=>setFilters(f=>({...f,include_unknown_price:v}))} disabled={disabled}/><Text style={ui.muted}>{t('budgetHint')}</Text></View>
  <View style={ui.card}><Text style={ui.title}>{t('eventLanguage')}</Text><Field label={t('eventLanguageCodes')} value={languages} onChange={setLanguages} disabled={disabled}/><Toggle label={t('allowUnknownLanguage')} value={filters.include_unknown_language} onChange={v=>setFilters(f=>({...f,include_unknown_language:v}))} disabled={disabled}/><Text style={ui.muted}>{t('eventLanguageHint')}</Text></View>
  <View style={ui.card}><Text style={ui.title}>{t('ageRange')}</Text><Field label={t('minimumAge')} value={ageMin} onChange={setAgeMin} disabled={disabled} numeric/><Field label={t('maximumAge')} value={ageMax} onChange={setAgeMax} disabled={disabled} numeric/><Toggle label={t('allowUnknownAge')} value={filters.include_unknown_age} onChange={v=>setFilters(f=>({...f,include_unknown_age:v}))} disabled={disabled}/><Text style={ui.muted}>{t('ageHint')}</Text></View>
  {Boolean(message)&&<Text accessibilityRole="alert" style={ui.text}>{message}</Text>}<Button label={busy?t('loading'):t('saveRule')} disabled={disabled} onPress={()=>void save()}/><Button label={t('cancel')} disabled={busy} variant="outline" onPress={()=>router.replace('/rules')}/>
 </>}</Screen>;
}
