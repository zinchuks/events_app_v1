import { useMetrics } from '@/lib/metrics-context';
import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import type { QueryData } from '@supabase/supabase-js';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { SavedPreferences } from '@/components/saved-preferences';
import { eventSelect, occurrenceTime, eventAvailability } from '@/lib/events';
import { isLocale,locales,type Locale } from '@/lib/messages';
function query() { return supabase!.from('occurrences').select(eventSelect); }
type Item = QueryData<ReturnType<typeof query>>[number];
type Translation = { title: string; description: string; summary: string|null; provider: string };
export default function EventScreen() {
 const { record } = useMetrics();
 const { id } = useLocalSearchParams<{ id: string }>(); const { t, locale } = useLanguage(); const { session } = useAuth();
 const owner = useRef(session?.user.id); owner.current = session?.user.id;
 const [item, setItem] = useState<Item | null>(null); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
 const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [message, setMessage] = useState('');
 const [manual,setManual]=useState(false);
 const [translation,setTranslation]=useState<Translation|null>(null);
 const [translationLocale,setTranslationLocale]=useState<Locale>(locale);
 const languageChoice=useRef(0);
 useEffect(() => { let active = true; languageChoice.current=0; setSaved(false); setMessage(''); setTranslation(null);setManual(false); setState('loading');
  async function load() {
   if (!supabase) { setState('error'); return; }
   const result = await query().eq('id', id).maybeSingle(); if (!active) return;
   if (result.error || !result.data) { setState('error'); return; } setItem(result.data); setState('ready');
   const correction=await supabase.rpc('s8_manual_correction',{selected_occurrence:id});if(active)setManual(correction.data===true);
   // Independent account preference; detail-page choice never changes the profile.
   const choice=languageChoice.current;const profile=session?await supabase.from('profiles').select('translation_locale').eq('id',session.user.id).maybeSingle():null;
   if(active&&languageChoice.current===choice)setTranslationLocale(isLocale(profile?.data?.translation_locale)?profile.data.translation_locale:locale);
   if (session) { const result = await supabase.from('saved_events').select('occurrence_id').eq('user_id', session.user.id).eq('occurrence_id', id).maybeSingle(); if (active) { if (result.error) setMessage(t('error')); else setSaved(Boolean(result.data)); } }
  }
  void load(); return () => { active = false; };
 }, [id, session?.user.id, locale]);
 useEffect(()=>{let active=true;setTranslation(null);if(item&&supabase)void supabase.rpc('s6_translation',{selected_event:item.event_id,selected_locale:translationLocale}).then(translated=>{
  if(active&&!translated.error&&translated.data&&typeof translated.data==='object'&&!Array.isArray(translated.data)&&typeof translated.data.title==='string'&&typeof translated.data.description==='string'&&typeof translated.data.provider==='string')setTranslation(translated.data as Translation);
 });return()=>{active=false;};},[item?.event_id,translationLocale]);
 async function toggle() {
  if (!supabase || !session || busy) return;
  const caller = session.user.id;
  setBusy(true); setMessage('');
  try {
   const result = saved ? await supabase.from('saved_events').delete().eq('user_id', session.user.id).eq('occurrence_id', id) : await supabase.from('saved_events').upsert({ user_id: session.user.id, occurrence_id: id });
   if (result.error) throw result.error; if (!saved) record('event_saved'); if (owner.current === caller) setSaved(!saved);
  } catch { if (owner.current === caller) setMessage(t('error')); } finally { setBusy(false); }
 }
 return <Screen title={t('eventDetails')}>
  {state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' || !item?.events ? <Text accessibilityRole="alert">{t('eventUnavailable')}</Text> : <View style={ui.card}>
   <Text style={ui.badge}>{occurrenceTime(item, locale, t('timeUnknown'))}</Text>{manual&&<Text style={ui.badge}>{t('manualCorrection')}</Text>}<Text accessibilityRole="header" style={ui.heading}>{item.events.title}</Text>
   <Text style={ui.muted}>{t('translation')}</Text><View style={ui.row}>{locales.map(lang=><Button key={lang} label={lang==='uk'?'Українська':lang==='en'?'English':'Español'} size="sm" variant={translationLocale===lang?'default':'outline'} accessibilityState={{selected:translationLocale===lang}} onPress={()=>{languageChoice.current++;setTranslationLocale(lang);}}/>)}</View>
   {!translation&&<Text style={ui.muted}>{t('translationUnavailable')}</Text>}
   {translation&&<View style={ui.card}><Text style={ui.badge}>{t(translation.provider.startsWith('source:')?'sourceTranslation':'aiTranslation')}</Text><Text style={ui.title}>{translation.title}</Text>{translation.summary&&<><Text style={ui.muted}>{t('shortDescription')}</Text><Text style={ui.text}>{translation.summary}</Text></>}<Text style={ui.text}>{translation.description}</Text></View>}
   {eventAvailability(item)&&<Text accessibilityRole="alert">{t(eventAvailability(item)!)}</Text>}
   {item.events.venue && <Text style={ui.text}>{item.events.venue}</Text>}
   <Text style={ui.muted}>{t('originalDescription')}</Text><Text style={ui.text}>{item.events.description || t('noDescription')}</Text>
   <Text style={ui.text}>{t('price')}: {item.events.price !== null && item.events.currency ? new Intl.NumberFormat(locale, { style: 'currency', currency: item.events.currency }).format(item.events.price) : t('priceUnknown')}</Text>
   <Text style={ui.muted}>{t('checked')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.events.checked_at))}</Text>
   <Text style={ui.muted}>{item.events.sources?.name}</Text>
   <Button label={t('sourceLicense')} variant="link" onPress={() => void Linking.openURL(item.events!.sources?.rights_reference ?? 'https://datos.madrid.es/pages/condiciones-de-uso')} />
   <Button label={t('map')} variant="outline" onPress={() => router.push({pathname:'/map',params:{occurrence:id}})} />
   <Button label={t('openOriginal')} onPress={() => { void Linking.openURL(item.events!.canonical_url).then(() => record('organizer_opened')).catch(() => setMessage(t('error'))); }} />
   {session ? <Button label={saved ? t('removeSaved') : t('saveEvent')} variant={saved ? 'outline' : 'default'} disabled={busy} onPress={() => void toggle()} /> : <Button label={t('signInToSave')} variant="outline" onPress={() => router.push('/account')} />}
  </View>}
  {saved&&session&&item&&<SavedPreferences key={session.user.id+id} occurrence={id} known={item.time_kind==='known'} scheduled={item.status==='scheduled'&&item.events.status==='scheduled'}/>}
  {Boolean(message) && <Text accessibilityRole="alert">{message}</Text>}
 </Screen>;
}
