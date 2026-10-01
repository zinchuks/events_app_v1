import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import type { QueryData } from '@supabase/supabase-js';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { eventSelect, occurrenceTime } from '@/lib/events';
function query() { return supabase!.from('digest_items').select(`occurrence_id,occurrences(${eventSelect})`); }
type Items = QueryData<ReturnType<typeof query>>;
export default function DigestScreen() {
 const { id } = useLocalSearchParams<{ id: string }>(); const { t, locale } = useLanguage(); const { session } = useAuth();
 const [items, setItems] = useState<Items>([]); const [state, setState] = useState('loading'); const [transport, setTransport] = useState('');
 useEffect(() => { let active = true; setItems([]); setTransport('');
  if (!session || !supabase) { setState('ready'); return; } setState('loading');
  void Promise.all([query().eq('digest_id', id).eq('user_id', session.user.id), supabase.from('notification_jobs').select('transport,status').eq('digest_id', id).eq('user_id', session.user.id).maybeSingle()]).then(([rows, job]) => {
   if (!active) return; setItems(rows.data ?? []); setState(rows.error || job.error ? 'error' : 'ready'); setTransport(job.data?.transport ?? '');
  }); return () => { active = false; };
 }, [id, session?.user.id]);
 const sorted = [...items].sort((a, b) => (a.occurrences?.start_at ?? a.occurrences?.local_date ?? '').localeCompare(b.occurrences?.start_at ?? b.occurrences?.local_date ?? ''));
 return <Screen title={t('yourDigest')}>{!session ? <Button label={t('signInForRule')} onPress={() => router.push('/account')} /> : state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' ? <Text>{t('error')}</Text> : <>
  <View style={ui.card}><Text style={ui.title}>{items.length} · {t('eventsCount')}</Text><Text style={ui.text}>{t('digestNotice')}</Text><Text style={ui.muted}>{transport === 'fixture' ? t('fixtureNotice') : transport === 'expo' ? t('pushPending') : t('digestUnavailable')}</Text></View>
  {sorted.map(row => row.occurrences?.events && <View key={row.occurrence_id} style={ui.card}><Text style={ui.badge}>{occurrenceTime(row.occurrences, locale, t('timeUnknown'))}</Text><Text style={ui.title}>{row.occurrences.events.title}</Text><Button variant="outline" label={t('eventDetails')} onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.occurrence_id } })} /></View>)}
 </>}</Screen>;
}
