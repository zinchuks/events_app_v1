import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { occurrenceTime } from '@/lib/events';
import type { Database } from '@/lib/database.types';
type Item=Database['public']['Functions']['list_rule_events']['Returns'][number];
export default function MatchesScreen(){
 const {t,locale}=useLanguage();const{session,loading}=useAuth();const[items,setItems]=useState<Item[]>([]);const[names,setNames]=useState<Record<string,string>>({});const[page,setPage]=useState(0);const[state,setState]=useState('loading');const[revision,setRevision]=useState(0);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 useEffect(()=>{setPage(0);setMessage('');},[session?.user.id]);
 useFocusEffect(useCallback(()=>{let active=true;setItems([]);setNames({});if(!session||!supabase){setState('ready');return;}setState('loading');void Promise.all([supabase.rpc('list_rule_events',{page_offset:page*30}),supabase.from('rules').select('id,name').eq('user_id',session.user.id).eq('filters->>scope','s4')]).then(([rows,rules])=>{if(active){setItems(rows.data??[]);setNames(Object.fromEntries((rules.data??[]).map(r=>[r.id,r.name])));setState(rows.error||rules.error?'error':'ready');}});return()=>{active=false;};},[session?.user.id,page,revision]));
 async function build(){if(!supabase||busy)return;setBusy(true);setMessage('');try{const{data,error}=await supabase.rpc('build_rule_digest');if(error)throw error;if(data)router.push({pathname:'/digest/[id]',params:{id:data}});else setMessage(t('noRuleMatches'));}catch(error){setMessage(error&&typeof error==='object'&&'message'in error&&String(error.message).includes('stale')?t('sourceStale'):t('error'));}finally{setBusy(false);}}
 return <Screen title={t('ruleMatches')}>{loading?<Text>{t('loading')}</Text>:!session?<Button label={t('signInForRule')} onPress={()=>router.push('/account')}/>:<>
  <View style={ui.card}><Text style={ui.text}>{t('unionHint')}</Text><Text style={ui.muted}>{t('s4Coverage')}</Text><Text style={ui.muted}>{t('manualDigest')}</Text><Button label={t('rules')} variant="outline" onPress={()=>router.push('/rules')}/><Button label={t('saveUnionDigest')} disabled={busy||state!=='ready'||items.length===0} onPress={()=>void build()}/>{Boolean(message)&&<Text accessibilityRole="alert">{message}</Text>}</View>
  {state==='loading'?<Text>{t('loading')}</Text>:state==='error'?<Text accessibilityRole="alert">{t('error')}</Text>:items.length===0?<Text style={ui.text}>{t('noRuleMatches')}</Text>:items.map(item=><View key={item.id} style={ui.card}><Text style={ui.badge}>{occurrenceTime(item,locale,t('timeUnknown'))}</Text><Text style={ui.title}>{item.title}</Text><Text style={ui.muted}>{item.matched_rules.map(id=>names[id]??'').filter(Boolean).join(' · ')}</Text><Button label={t('eventDetails')} variant="outline" onPress={()=>router.push({pathname:'/event/[id]',params:{id:item.id}})}/></View>)}
  <View style={ui.row}><Button label={t('previous')} size="sm" variant="outline" disabled={page===0||state==='loading'} onPress={()=>setPage(v=>v-1)}/><Text>{page+1}</Text><Button label={t('next')} size="sm" variant="outline" disabled={items.length<30||state==='loading'} onPress={()=>setPage(v=>v+1)}/></View><Button label={t('refreshEvents')} variant="link" onPress={()=>setRevision(v=>v+1)}/>
 </>}</Screen>;
}
