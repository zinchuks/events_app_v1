import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { ui, useScreenScroll } from './screen';
import { Button } from './ui/button';
import { Field } from './rule-fields';
import { EventCard } from './event-card';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { FeedResult } from '@/lib/discovery';
export function DiscoveryFeed(){
 const{t}=useLanguage();const scrollTop=useScreenScroll();const{session,loading}=useAuth();const owner=useRef(session?.user.id);owner.current=session?.user.id;const params=useLocalSearchParams<{mode?:string}>();
 const[choice,setChoice]=useState<'matches'|'catalog'|null>(params.mode==='catalog'?'catalog':params.mode==='matches'?'matches':null);
 const[search,setSearch]=useState('');const[query,setQuery]=useState('');const[page,setPage]=useState(0);const[revision,setRevision]=useState(0);const[state,setState]=useState('loading');const[result,setResult]=useState<FeedResult>({items:[],total:0,mapped:0});const[names,setNames]=useState<Record<string,string>>({});const[ruleCount,setRuleCount]=useState<number|null>(null);const[busy,setBusy]=useState(false);const[message,setMessage]=useState('');
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(search.trim());setPage(0);},350);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{setPage(0);setChoice(params.mode==='catalog'?'catalog':params.mode==='matches'?'matches':null);setRuleCount(null);setResult({items:[],total:0,mapped:0});setMessage('');},[session?.user.id,params.mode]);
 useEffect(()=>{scrollTop();},[page,query,choice,scrollTop]);
 const mode=choice??(session&&ruleCount!==0?'matches':'catalog');
 useFocusEffect(useCallback(()=>{let active=true;if(loading)return;setState('loading');setMessage('');setResult({items:[],total:0,mapped:0});
  void(async()=>{if(!supabase)throw Error('Unavailable');
   const rules=session?await supabase.from('rules').select('id,name,enabled').eq('user_id',session.user.id).eq('filters->>scope','s4'):null;
   if(rules?.error)throw rules.error;if(!active)return;const rows=rules?.data??[];setNames(Object.fromEntries(rows.map(r=>[r.id,r.name])));setRuleCount(rows.length);
   const view=choice??(session&&rows.length>0?'matches':'catalog');
   const{data,error}=await supabase.rpc('list_s5_events',{view_mode:view,search_text:query,page_offset:page*30});if(error)throw error;if(active){setResult(data as unknown as FeedResult);setState('ready');}
  })().catch(()=>{if(active)setState('error');});return()=>{active=false;};},[session?.user.id,loading,choice,query,page,revision]));
 async function build(){if(!supabase||!session||busy)return;const caller=session.user.id;setBusy(true);setMessage('');try{const{data,error}=await supabase.rpc('build_rule_digest');if(error)throw error;if(owner.current===caller){if(data)router.push({pathname:'/digest/[id]',params:{id:data}});else setMessage(t('noRuleMatches'));}}catch(error){if(owner.current===caller)setMessage(error&&typeof error==='object'&&'message' in error&&String(error.message).includes('stale')?t('sourceStale'):t('error'));}finally{setBusy(false);}}
 function select(next:'matches'|'catalog'){setChoice(next);setPage(0);}
 if(loading)return <Text accessibilityLiveRegion="polite">{t('loading')}</Text>;
 return <>
  <View style={ui.card}>{(!session||ruleCount===0)&&<Text style={ui.text}>{t('feedIntro')}</Text>}{!session&&choice==='matches'&&<Button label={t('signInForRule')} onPress={()=>router.push('/account')}/>}<View style={ui.row}>{session&&<Button size="sm" label={t('myEvents')} accessibilityState={{selected:mode==='matches'}} variant={mode==='matches'?'default':'outline'} onPress={()=>select('matches')}/>}<Button size="sm" label={t('allEvents')} accessibilityState={{selected:mode==='catalog'}} variant={mode==='catalog'?'default':'outline'} onPress={()=>select('catalog')}/></View>
  <Field label={t('searchEvents')} value={search} onChange={v=>setSearch(v.slice(0,120))}/><Text style={ui.muted}>{t('s4Coverage')}</Text>
  {session&&ruleCount===0&&<Button label={t('startOnboarding')} onPress={()=>router.push('/onboarding')}/>}
  {!session&&<Button label={t('startOnboarding')} onPress={()=>router.push('/onboarding')}/>}
  <View style={ui.row}><Button label={t('map')} variant="outline" onPress={()=>router.push({pathname:'/map',params:{mode,search:query}})}/><Button label={t('sourcesHeading')} variant="link" onPress={()=>router.push('/sources')}/>{session&&<Button label={t('rules')} variant="link" onPress={()=>router.push('/rules')}/>}</View></View>
  {state==='loading'?<Text accessibilityLiveRegion="polite">{t('loading')}</Text>:state==='error'?<View style={ui.card}><Text accessibilityRole="alert">{t('error')}</Text><Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></View>:<>
  <Text accessibilityLiveRegion="polite" style={ui.muted}>{t('resultsCount')}: {result.total}</Text>
  {result.items.length===0?<View style={ui.card}><Text style={ui.text}>{query?t('noSearchResults'):mode==='matches'?t('noRuleMatches'):t('noEvents')}</Text>{Boolean(query)&&<Button label={t('clearSearch')} variant="outline" onPress={()=>setSearch('')}/>}<Button label={t('startOnboarding')} onPress={()=>router.push('/onboarding')}/></View>:result.items.map(item=><EventCard key={item.id} item={item} names={names}/>)}
  {result.total>30&&<View style={ui.row}><Button label={t('previous')} variant="outline" disabled={page===0} onPress={()=>setPage(v=>v-1)}/><Text accessibilityLabel={t('page')}>{page+1} / {Math.ceil(result.total/30)}</Text><Button label={t('next')} variant="outline" disabled={(page+1)*30>=result.total} onPress={()=>setPage(v=>v+1)}/></View>}
  {mode==='matches'&&result.total>0&&!query&&<Button label={t('saveUnionDigest')} loading={busy} onPress={()=>void build()}/>}</>}
  {Boolean(message)&&<Text accessibilityRole="alert">{message}</Text>}
 </>;
}
