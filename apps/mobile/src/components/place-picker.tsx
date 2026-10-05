import { useEffect, useRef, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button } from './ui/button';
import { Field } from './rule-fields';
import { ui } from './screen';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { label, type Area } from '@/lib/rules';
import type { Place } from '@/lib/places';
export function PlacePicker({kind,disabled=false,onChoose}:{kind:Place['kind'];disabled?:boolean;onChoose(area:Area,name:string):void}) {
 const {t,locale}=useLanguage();const {session}=useAuth();const owner=useRef(session?.user.id);owner.current=session?.user.id;const [search,setSearch]=useState('');const [page,setPage]=useState(0);const [rows,setRows]=useState<Place[]>([]);const [more,setMore]=useState(false);const [state,setState]=useState('loading');const [revision,setRevision]=useState(0);const [busy,setBusy]=useState(false);const [km,setKm]=useState('10');const generation=useRef(0);
 useEffect(()=>{let active=true;const version=++generation.current;const controller=new AbortController();let deadline:ReturnType<typeof setTimeout>|undefined;setState('loading');setRows([]);setMore(false);
  const timer=setTimeout(()=>{void(async()=>{if(!supabase)throw Error('Unavailable');deadline=setTimeout(()=>controller.abort(),12000);const {data,error}=await supabase.rpc('search_places',{query_text:search,place_kind:kind,locale,page_offset:page*25}).abortSignal(controller.signal);if(error)throw error;if(active&&generation.current===version){const response=data as unknown as {items:Place[];has_more:boolean};setRows(response.items);setMore(response.has_more);setState('ready');}})().catch(()=>{if(active&&generation.current===version)setState('error');}).finally(()=>{clearTimeout(deadline);});},250);
  return()=>{active=false;clearTimeout(timer);clearTimeout(deadline);controller.abort();};
 },[search,page,kind,locale,revision,session?.user.id]);
 useEffect(()=>{setSearch('');setPage(0);},[kind]);
 async function choose(place:Place,radius:boolean){if(disabled||busy)return;setBusy(true);const version=generation.current;const caller=owner.current;try{
  const name=[label(place.names,locale),place.region,place.country_code].filter(Boolean).join(' · ');
  if(radius){const meters=Number(km.trim().replace(',','.'))*1000;if(!Number.isFinite(meters)||meters<1||meters>500000||place.longitude===null||place.latitude===null)throw Error('Invalid radius');onChoose({kind:'radius',parameters:{longitude:place.longitude,latitude:place.latitude,meters}},name);}
  else{if(!supabase)throw Error('Unavailable');const {data,error}=await supabase.rpc('resolve_place',{place_key:place.key});if(error)throw error;if(generation.current!==version||owner.current!==caller)return;const resolved=data as unknown as Place;if(!resolved.territory_id)throw Error('Unavailable');onChoose({kind:resolved.kind,territory_id:resolved.territory_id,parameters:{}},name);}
 }catch{if(generation.current===version)setState('error');}finally{setBusy(false);}}
 return <View style={{gap:10}}><Field label={t('territorySearch')} value={search} onChange={v=>{setSearch(v);setPage(0);}} disabled={disabled||busy}/>
 <Text style={ui.muted}>{t('globalPlacesHint')}</Text><Button label="GeoNames · CC BY 4.0" variant="link" onPress={()=>void Linking.openURL('https://www.geonames.org/')} /><Button label={t('sourceLicense')} variant="link" onPress={()=>void Linking.openURL('https://creativecommons.org/licenses/by/4.0/')} />
 {kind==='city'&&<Field label={t('radiusKm')} value={km} numeric onChange={setKm} disabled={disabled||busy}/>}
 {state==='loading'?<Text>{t('loading')}</Text>:state==='error'?<><Text accessibilityRole="alert">{t('error')}</Text><Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></>:<>
 {rows.map(place=><View key={place.key} style={{gap:5}}><Text style={ui.text}>{[label(place.names,locale),place.region,place.country_code].filter(Boolean).join(' · ')}</Text>
 {!place.has_catalog_events&&<Text style={ui.muted}>{t('placeCoverageUnknown')}</Text>}
 {place.kind==='city'&&!place.has_boundary&&<Text style={ui.muted}>{t('placePointNotice')}</Text>}
 {(place.kind!=='city'||place.has_boundary||place.has_catalog_events)&&<Button label={t('selectPlace')} variant="outline" disabled={disabled||busy} onPress={()=>void choose(place,false)}/>}
 {place.kind==='city'&&place.latitude!==null&&place.longitude!==null&&<Button label={`${t('selectPlaceRadius')} · ${km} km`} variant="outline" disabled={disabled||busy} onPress={()=>void choose(place,true)}/>}
 </View>)}{rows.length===0&&<Text>{search.trim().length===1?t('placeMinimumSearch'):t('noSearchResults')}</Text>}
 <View style={ui.row}><Button label={t('previous')} disabled={page===0||disabled||busy} onPress={()=>setPage(v=>v-1)}/><Text>{page+1}</Text><Button label={t('next')} disabled={!more||disabled||busy||page>=400} onPress={()=>setPage(v=>v+1)}/></View>
 </>}</View>;
}
