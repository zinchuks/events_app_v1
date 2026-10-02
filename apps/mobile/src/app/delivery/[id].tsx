import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { DeliveryFields } from '@/components/delivery-fields';
import { useLanguage } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { validPreferences, type DeliveryPreferences } from '@/lib/discovery';
import type { Json } from '@/lib/database.types';
export default function DeliveryScreen(){const{id}=useLocalSearchParams<{id:string}>();const{t}=useLanguage();const{session,loading}=useAuth();const[state,setState]=useState('loading');const[timezone,setTimezone]=useState('Europe/Madrid');const[value,setValue]=useState<DeliveryPreferences>({mode:'manual',time:'18:00',days:7,weekdays:[1],anchor:new Date().toISOString().slice(0,10)});const[message,setMessage]=useState('');const[busy,setBusy]=useState(false);const owner=useRef(session?.user.id);owner.current=session?.user.id;
 useEffect(()=>{let active=true;setState('loading');if(!session||!supabase){setState('ready');return;}void supabase.from('rules').select('timezone,delivery_schedule').eq('id',id).eq('user_id',session.user.id).eq('filters->>scope','s4').single().then(({data,error})=>{if(!active)return;if(error)setState('error');else{setTimezone(data.timezone);setValue(v=>({...v,...data.delivery_schedule as unknown as DeliveryPreferences}));setState('ready');}});return()=>{active=false;};},[session?.user.id,id]);
 async function save(){if(!supabase||!session||busy)return;const caller=session.user.id;setMessage('');try{new Intl.DateTimeFormat('en',{timeZone:timezone});if(!validPreferences(value))throw Error('Invalid');setBusy(true);const{error}=await supabase.rpc('set_s5_delivery_preferences',{selected_rule:id,delivery_preferences:value as unknown as Json,rule_timezone:timezone});if(error)throw error;if(owner.current===caller)router.replace('/rules');}catch{if(owner.current===caller)setMessage(t('scheduleInvalid'));}finally{setBusy(false);}}
 return <Screen title={t('deliveryPreferences')}>{loading||state==='loading'?<Text>{t('loading')}</Text>:!session?<Button label={t('signIn')} onPress={()=>router.push('/account')}/>:state==='error'?<Text accessibilityRole="alert">{t('ruleUnavailable')}</Text>:<View style={ui.card}><DeliveryFields value={value} onChange={setValue} timezone={timezone} onTimezone={setTimezone}/><Button label={t('save')} loading={busy} onPress={()=>void save()}/></View>}{Boolean(message)&&<Text accessibilityRole="alert">{message}</Text>}</Screen>;
}
