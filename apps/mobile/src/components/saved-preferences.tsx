import { useEffect, useState } from 'react';
import { Text, View, Switch, TextInput } from 'react-native';
import { Button } from '@/components/ui/button';
import { form } from '@/components/rule-fields';
import { ui } from '@/components/screen';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n';
export function SavedPreferences({ occurrence, known, scheduled }: { occurrence: string; known: boolean; scheduled: boolean }) {
 const { t, locale } = useLanguage();
 const [leads, setLeads] = useState<number[]>([]);const [updates, setUpdates] = useState(true);
 const [zone,setZone]=useState('UTC');const [displayZone,setDisplayZone]=useState('UTC');const [quiet,setQuiet]=useState(false);const [start,setStart]=useState('22:00');const [end,setEnd]=useState('08:00');
 const [state,setState]=useState('loading');const [message,setMessage]=useState('');const [next,setNext]=useState<string|null>(null);const [revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setState('loading');
  if(supabase)void Promise.all([
   supabase.from('saved_events').select('reminder_minutes,updates_enabled,reminder_timezone,reminder_quiet').eq('occurrence_id',occurrence).single(),
   supabase.from('s8_alerts').select('run_at').eq('occurrence_id',occurrence).eq('kind','reminder').eq('status','pending').order('run_at').limit(1),
  ]).then(([prefs,alerts])=>{if(!active)return;if(prefs.error||alerts.error||!prefs.data){setState('error');return;}
   setLeads(prefs.data.reminder_minutes);setUpdates(prefs.data.updates_enabled);setZone(prefs.data.reminder_timezone);setDisplayZone(prefs.data.reminder_timezone);
   const q=prefs.data.reminder_quiet;setQuiet(Boolean(q));if(q&&typeof q==='object'&&!Array.isArray(q)){setStart(typeof q.start==='string'?q.start:'22:00');setEnd(typeof q.end==='string'?q.end:'08:00');}
   setNext(alerts.data?.[0]?.run_at??null);setState('ready');
  });return()=>{active=false;};},[occurrence,revision]);
 async function save(){if(!supabase||state==='saving')return;setState('saving');setMessage('');
  const r=await supabase.rpc('set_s8_saved_preferences',{selected_occurrence:occurrence,leads,updates,zone,quiet:quiet?{start,end}:null});
  if(r.error){setState('ready');setMessage(t('savedPreferencesInvalid'));}else{setMessage(t('preferencesSaved'));setRevision(v=>v+1);}
 }
 return <View style={ui.card}><Text style={ui.title}>{t('savedPreferences')}</Text>
  {state==='loading'?<Text>{t('loading')}</Text>:state==='error'?<><Text>{t('error')}</Text><Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></>:<>
   <View style={ui.row}><Text style={ui.text}>{t('savedUpdates')}</Text><Switch accessibilityLabel={t('savedUpdates')} value={updates} onValueChange={setUpdates}/></View>
   <Text style={ui.muted}>{t('cancellationAlways')}</Text><Text style={ui.title}>{t('eventReminders')}</Text>
   {!scheduled?<Text style={ui.muted}>{t('remindersStopped')}</Text>:!known&&<Text style={ui.muted}>{t('remindersKnownOnly')}</Text>}
   {[1440,120].map(lead=><View key={lead} style={ui.row}><Text style={ui.text}>{t(lead===1440?'oneDayBefore':'twoHoursBefore')}</Text><Switch accessibilityLabel={t(lead===1440?'oneDayBefore':'twoHoursBefore')} value={leads.includes(lead)} onValueChange={on=>setLeads(v=>on?[...v.filter(x=>x!==lead),lead]:v.filter(x=>x!==lead))}/></View>)}
   <Text style={ui.muted}>{t('timezone')}</Text><TextInput style={form.input} accessibilityLabel={t('timezone')} value={zone} onChangeText={setZone} autoCapitalize="none"/>
   <View style={ui.row}><Text>{t('quietHours')}</Text><Switch accessibilityLabel={t('quietHours')} value={quiet} onValueChange={setQuiet}/></View>
   {quiet&&<><Text style={ui.muted}>{t('quietStart')}</Text><TextInput style={form.input} accessibilityLabel={t('quietStart')} value={start} onChangeText={setStart}/><Text style={ui.muted}>{t('quietEnd')}</Text><TextInput style={form.input} accessibilityLabel={t('quietEnd')} value={end} onChangeText={setEnd}/></>}
   <Text style={ui.muted}>{t('reminderHint')}</Text>
   <Text style={ui.text}>{next?t('nextReminder')+': '+new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:displayZone}).format(new Date(next)):t('noPendingReminder')}</Text>
   <Button label={t('savePreferences')} disabled={state==='saving'} onPress={()=>void save()}/>
  </>}{Boolean(message)&&<Text accessibilityRole="alert">{message}</Text>}
 </View>;
}
