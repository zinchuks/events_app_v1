import { useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, Text, View } from 'react-native';
import type { QueryData } from '@supabase/supabase-js';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { eventSelect, occurrenceTime } from '@/lib/events';
function query() { return supabase!.from('occurrences').select(eventSelect); }
type Item = QueryData<ReturnType<typeof query>>[number];
export default function EventScreen() {
 const { id } = useLocalSearchParams<{ id: string }>(); const { t, locale } = useLanguage(); const { session } = useAuth();
 const owner = useRef(session?.user.id); owner.current = session?.user.id;
 const [item, setItem] = useState<Item | null>(null); const [saved, setSaved] = useState(false); const [busy, setBusy] = useState(false);
 const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [message, setMessage] = useState('');
 useEffect(() => { let active = true; setSaved(false); setMessage(''); setState('loading');
  async function load() {
   if (!supabase) { setState('error'); return; }
   const result = await query().eq('id', id).maybeSingle(); if (!active) return;
   if (result.error || !result.data) { setState('error'); return; } setItem(result.data); setState('ready');
   if (session) { const result = await supabase.from('saved_events').select('occurrence_id').eq('user_id', session.user.id).eq('occurrence_id', id).maybeSingle(); if (active) { if (result.error) setMessage(t('error')); else setSaved(Boolean(result.data)); } }
  }
  void load(); return () => { active = false; };
 }, [id, session?.user.id, locale]);
 async function toggle() {
  if (!supabase || !session || busy) return;
  const caller = session.user.id;
  setBusy(true); setMessage('');
  try {
   const result = saved ? await supabase.from('saved_events').delete().eq('user_id', session.user.id).eq('occurrence_id', id) : await supabase.from('saved_events').upsert({ user_id: session.user.id, occurrence_id: id });
   if (result.error) throw result.error; if (owner.current === caller) setSaved(!saved);
  } catch { if (owner.current === caller) setMessage(t('error')); } finally { setBusy(false); }
 }
 return <Screen title={t('eventDetails')}>
  {state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' || !item?.events ? <Text accessibilityRole="alert">{t('eventUnavailable')}</Text> : <View style={ui.card}>
   <Text style={ui.badge}>{occurrenceTime(item, locale, t('timeUnknown'))}</Text><Text accessibilityRole="header" style={ui.heading}>{item.events.title}</Text>
   {(item.status !== 'scheduled' || item.events.status !== 'scheduled') && <Text accessibilityRole="alert">{t('notScheduled')}</Text>}
   {item.events.venue && <Text style={ui.text}>{item.events.venue}</Text>}
   <Text style={ui.muted}>{t('originalDescription')}</Text><Text style={ui.text}>{item.events.description || t('noDescription')}</Text>
   <Text style={ui.text}>{t('price')}: {item.events.price !== null && item.events.currency ? new Intl.NumberFormat(locale, { style: 'currency', currency: item.events.currency }).format(item.events.price) : t('priceUnknown')}</Text>
   <Text style={ui.muted}>{t('checked')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.events.checked_at))}</Text>
   <Text style={ui.muted}>{item.events.sources?.name}</Text>
   <Button label={t('sourceLicense')} variant="link" onPress={() => void Linking.openURL(item.events!.sources?.rights_reference ?? 'https://datos.madrid.es/pages/condiciones-de-uso')} />
   <Button label={t('map')} variant="outline" onPress={() => router.push({pathname:'/map',params:{occurrence:id}})} />
   <Button label={t('openOriginal')} onPress={() => void Linking.openURL(item.events!.canonical_url)} />
   {session ? <Button label={saved ? t('removeSaved') : t('saveEvent')} variant={saved ? 'outline' : 'default'} disabled={busy} onPress={() => void toggle()} /> : <Button label={t('signInToSave')} variant="outline" onPress={() => router.push('/account')} />}
  </View>}
  {Boolean(message) && <Text accessibilityRole="alert">{message}</Text>}
 </Screen>;
}
