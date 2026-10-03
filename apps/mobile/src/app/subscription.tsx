import { useMetrics } from '@/lib/metrics-context';
import { useCallback,useState } from 'react';
import { router,useFocusEffect } from 'expo-router';
import { Platform,Text,View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { Screen,ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { billingAvailable,offerings,purchase,restore } from '@/lib/billing';
import type { Rule } from '@/lib/rules';
type State={tier:'free'|'plus';limit:number;configured:boolean;sdk_products:string[];expires_at:string|null;grace_until:string|null;verified_at:string|null;active_rules:string[];free_eligible:string[];reconcile_pending:boolean};
export default function Subscription(){const{session,loading}=useAuth();const{t}=useLanguage();return <Screen title={t('subscription')}>{loading?<Text>{t('loading')}</Text>:session?<Plan key={session.user.id} owner={session.user.id}/>:<Button label={t('signInForRule')} onPress={()=>router.push('/account')}/>}</Screen>;}
function Plan({owner}:{owner:string}){
 const{t,locale}=useLanguage();const{record}=useMetrics();const[state,setState]=useState<State|null>(null);const[rules,setRules]=useState<Rule[]>([]);const[items,setItems]=useState<PurchasesPackage[]>([]);const[busy,setBusy]=useState(false);const[error,setError]=useState(false);const[revision,setRevision]=useState(0);
 useFocusEffect(useCallback(()=>{let active=true;setError(false);void(async()=>{
  if(!supabase)throw Error('not_configured');
  const s=await supabase.rpc('s9_state');if(s.error)throw s.error;
  const r=await supabase.from('rules').select('*').eq('user_id',owner).eq('filters->>scope','s4').order('name');if(r.error)throw r.error;
  const value=s.data as unknown as State;if(active){setState(value);setRules(r.data);}
  if(value.configured&&billingAvailable()){const p=await offerings(owner);if(active)setItems(p.filter(item=>value.sdk_products.includes(item.product.identifier)));}
 })().catch(()=>{if(active)setError(true);});return()=>{active=false;};},[owner,revision]));
 async function run(action:()=>Promise<void>){if(busy)return;setBusy(true);setError(false);try{await action();setRevision(x=>x+1);}catch{setError(true);}finally{setBusy(false);}}
 const native=state?.configured&&billingAvailable();
 return <>{error&&<View style={ui.card}><Text accessibilityRole="alert">{t('billingError')}</Text><Button label={t('retry')} disabled={busy} onPress={()=>setRevision(x=>x+1)}/></View>}{!state&&!error?<Text>{t('loading')}</Text>:state&&<>
  <View style={ui.card}><Text style={ui.badge}>{t('currentPlan')}: {state.tier==='plus'?'Plus':'Free'}</Text><Text style={ui.title}>{state.active_rules.length} / {state.limit} · {t('activeRule')}</Text><Text style={ui.text}>{state.tier==='plus'?t('plusFeatures'):t('freeFeatures')}</Text>{state.tier==='plus'&&state.expires_at&&<Text style={ui.muted}>{t('accessUntil')}: {new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(state.grace_until&&Date.parse(state.grace_until)>Date.parse(state.expires_at)?state.grace_until:state.expires_at))}</Text>}<Text style={ui.muted}>{t('billingPreserved')}</Text></View>
  <View style={ui.card}><Text style={ui.title}>Plus</Text><Text style={ui.text}>{t('plusFeatures')}</Text>{!native?<View style={{gap:8}}>{(!state.configured||Platform.OS!=='web')&&<Text style={ui.text}>{t('billingNotConfigured')}</Text>}{Platform.OS==='web'&&<Text style={ui.text}>{t('billingBrowser')}</Text>}</View>:<>{items.length===0&&<Text style={ui.text}>{t('noOffering')}</Text>}{items.map(item=><View key={item.identifier} style={{gap:8}}><Text style={ui.text}>{item.product.title}</Text><Button disabled={busy} label={`${t(item.packageType==='ANNUAL'?'annualPlan':'monthlyPlan')} · ${item.product.priceString}`} onPress={()=>void run(async()=>{await purchase(owner,item);record('purchase');})}/></View>)}<Text style={ui.muted}>{t('renewalNotice')}</Text><Button disabled={busy} label={t('restorePurchases')} variant="outline" onPress={()=>void run(()=>restore(owner))}/></>}{state.reconcile_pending&&<Text accessibilityLiveRegion="polite" style={ui.text}>{t('verificationPending')}</Text>}<Button disabled={busy} label={t('refreshPlan')} variant="outline" onPress={()=>void run(async()=>{if(state.configured){const r=await supabase!.rpc('request_s9_reconcile');if(r.error)throw r.error;}})}/></View>
  {state.tier==='free'&&<View style={ui.card}><Text style={ui.title}>{t('chooseFreeRule')}</Text><Text style={ui.text}>{t('freeChoiceHint')}</Text>{rules.map(rule=><View key={rule.id} style={{gap:8}}><Text style={ui.text}>{rule.name} · {state.active_rules.includes(rule.id)?t('activeRule'):(rule.enabled?t('billingPaused'):t('pausedRule'))}</Text>{state.free_eligible.includes(rule.id)?<Button disabled={busy||state.active_rules.includes(rule.id)} label={t('useFreeRule')} variant="outline" onPress={()=>void run(async()=>{const r=await supabase!.rpc('choose_s9_free_rule',{selected_rule:rule.id});if(r.error)throw r.error;})}/>:<Button label={t('editRule')} disabled={busy} variant="outline" onPress={()=>router.push({pathname:'/rule/[id]',params:{id:rule.id}})}/>}</View>)}<Button label={t('newRule')} variant="outline" onPress={()=>router.push('/onboarding')}/></View>}
 </>}</>;
}
