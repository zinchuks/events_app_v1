import { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { EventMap } from '@/components/event-map';
import { EventCard } from '@/components/event-card';
import { useLanguage } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { coordinates, type FeedResult } from '@/lib/discovery';
const empty:FeedResult={items:[],total:0,mapped:0};
export default function MapScreen(){
 const{t}=useLanguage();const{session,loading}=useAuth();const params=useLocalSearchParams<{mode?:string;search?:string;occurrence?:string}>();const mode=params.mode==='matches'?'matches':'catalog';const[result,setResult]=useState(empty);const[state,setState]=useState('loading');const[revision,setRevision]=useState(0);const[focus,setFocus]=useState<[number,number]|undefined>();const[focused,setFocused]=useState(false);useFocusEffect(useCallback(()=>{setFocused(true);return()=>setFocused(false);},[]));const[selected,setSelected]=useState<string|null>(null);
 useFocusEffect(useCallback(()=>{let active=true;setResult(empty);setFocus(undefined);setState('loading');setSelected(null);if(loading)return;
  void(async()=>{if(!supabase)throw Error('Unavailable');const{data,error}=await supabase.rpc('list_s5_events',{view_mode:mode,search_text:(params.search??'').slice(0,120),page_size:1000});if(error)throw error;
   if(params.occurrence){const c=await supabase.rpc('s5_event_coordinates',{occurrence:params.occurrence});if(c.error)throw c.error;const point=c.data?coordinates(c.data as unknown as {longitude:number;latitude:number}):null;if(active)setFocus(point??undefined);}
   if(active){setResult(data as unknown as FeedResult);setState('ready');}
  })().catch(()=>{if(active)setState('error');});return()=>{active=false;};},[session?.user.id,loading,mode,params.search,params.occurrence,revision]));
 const item=result.items.find(i=>i.id===selected);
 return <Screen title={t('map')}><View style={ui.card}><Text style={ui.text}>{t('mapIntro')}</Text><Text style={ui.muted}>{t('s4Coverage')}</Text><Button label={t('browse')} variant="outline" onPress={()=>router.push({pathname:'/',params:{mode}})}/></View>
 {state==='loading'?<Text>{t('loading')}</Text>:state==='error'?<View style={ui.card}><Text accessibilityRole="alert">{t('error')}</Text>{!session&&mode==='matches'&&<Button label={t('signIn')} onPress={()=>router.push('/account')}/>}<Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></View>:<>
 {focused&&<EventMap items={result.items} focus={focus} onSelect={setSelected}/>}
 <Text style={ui.text}>{t('mappedCount')}: {result.mapped} / {result.total}</Text>{result.mapped<result.total&&<Text style={ui.muted}>{t('unknownCoordinates')}</Text>}{params.occurrence&&!focus&&<Text style={ui.text}>{t('eventCoordinatesUnknown')}</Text>}{result.total>1000&&<Text style={ui.muted}>{t('mapLimit')}</Text>}
 <View style={ui.row}><Button size="sm" variant="link" label="OpenFreeMap" onPress={()=>void Linking.openURL('https://openfreemap.org/')}/><Button size="sm" variant="link" label="© OpenMapTiles" onPress={()=>void Linking.openURL('https://openmaptiles.org/')}/><Button size="sm" variant="link" label="© OpenStreetMap" onPress={()=>void Linking.openURL('https://www.openstreetmap.org/copyright')}/></View>
 {item&&<EventCard item={item}/>}<Text style={ui.muted}>{t('mapPrivacy')}</Text></>}
 </Screen>;
}
