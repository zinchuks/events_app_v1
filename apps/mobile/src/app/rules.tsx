import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import type { Rule } from '@/lib/rules';
export default function RulesScreen() {
 const { t }=useLanguage(); const { session, loading }=useAuth(); const [rules,setRules]=useState<Rule[]>([]); const [state,setState]=useState('loading'); const [revision,setRevision]=useState(0); const [busy,setBusy]=useState(false); const [deleting,setDeleting]=useState<string|null>(null);
 useFocusEffect(useCallback(()=>{let active=true; setRules([]); setDeleting(null); if(!session || !supabase){setState('ready'); return;} setState('loading'); void supabase.from('rules').select('*').eq('user_id',session.user.id).eq('filters->>scope','s4').order('name').then(({data,error})=>{if(active){setRules(data??[]);setState(error?'error':'ready');}}); return()=>{active=false;};},[session?.user.id,revision]));
 async function mutate(rule:Rule,remove:boolean){if(!supabase||!session||busy)return;setBusy(true); const result=remove ? await supabase.from('rules').delete().eq('id',rule.id).eq('user_id',session.user.id):await supabase.rpc('set_s4_rule_enabled',{selected_rule:rule.id,rule_enabled:!rule.enabled}); setBusy(false); if(result.error)setState('error'); else setRevision(v=>v+1);}
 return <Screen title={t('rules')}>{loading ? <Text>{t('loading')}</Text> : !session ? <Button label={t('signInForRule')} onPress={()=>router.push('/account')}/> : <>
  <View style={ui.card}><Text style={ui.text}>{t('rulesHint')}</Text><Text style={ui.muted}>{t('s4Coverage')}</Text><Button label={t('newRule')} disabled={busy || state==='loading'} onPress={()=>router.push('/rule/new')}/><Button label={t('ruleMatches')} variant="outline" onPress={()=>router.push('/matches')}/></View>
  {state==='loading'?<Text>{t('loading')}</Text>:state==='error'?<Text accessibilityRole="alert">{t('error')}</Text>:rules.length===0?<Text style={ui.text}>{t('noRules')}</Text>:rules.map(rule=><View key={rule.id} style={ui.card}><Text style={ui.badge}>{rule.enabled?t('activeRule'):t('pausedRule')}</Text><Text style={ui.title}>{rule.name}</Text><View style={ui.row}><Button size="sm" label={t('editRule')} variant="outline" disabled={busy} onPress={()=>router.push({pathname:'/rule/[id]',params:{id:rule.id}})}/><Button size="sm" label={rule.enabled?t('pauseRule'):t('resumeRule')} variant="outline" disabled={busy} onPress={()=>void mutate(rule,false)}/><Button size="sm" label={t('deleteRule')} variant="link" disabled={busy} onPress={()=>setDeleting(rule.id)}/></View>{deleting===rule.id&&<><Text style={ui.text}>{t('deleteRuleHint')}</Text><Button variant="destructive" label={t('confirmDeleteRule')} disabled={busy} onPress={()=>void mutate(rule,true)}/><Button label={t('cancel')} variant="outline" disabled={busy} onPress={()=>setDeleting(null)}/></>}</View>)}
  <Button label={t('refreshEvents')} variant="link" disabled={busy} onPress={()=>setRevision(v=>v+1)}/>
 </>}</Screen>;
}
