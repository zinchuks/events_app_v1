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
async function readItems(digestId: string, userId: string) {
 const data: Items = [];
 // S4 caps a manual selection at 5000; PostgREST returns at most 1000/page.
 for (let offset = 0; offset < 5000; offset += 1000) {
  const page = await query().eq('digest_id', digestId).eq('user_id', userId).order('occurrence_id').range(offset, offset + 999);
  if (page.error) return { data: null, error: page.error };
  data.push(...page.data);
  if (page.data.length < 1000) break;
 }
 return { data, error: null };
}
export default function DigestScreen() {
 const { id } = useLocalSearchParams<{ id: string }>(); const { t, locale } = useLanguage(); const { session } = useAuth();
 const [items, setItems] = useState<Items>([]); const [state, setState] = useState('loading'); const [transport, setTransport] = useState('');
 useEffect(() => { let active = true; setItems([]); setTransport('');
  if (!session || !supabase) { setState('ready'); return; } setState('loading');
  void Promise.all([readItems(id, session.user.id), supabase.from('notification_jobs').select('transport,status').eq('digest_id', id).eq('user_id', session.user.id).maybeSingle(), supabase.from('digests').select('id,business_key').eq('id',id).eq('user_id',session.user.id).maybeSingle()]).then(([rows, job, digest]) => {
   if (!active) return; setItems(rows.data ?? []); setState(rows.error || job.error || digest.error ? 'error' : !digest.data ? 'unavailable' : 'ready'); setTransport(job.data?.transport ?? (digest.data?.business_key.startsWith('s4:') ? 'manual' : ''));
  }); return () => { active = false; };
 }, [id, session?.user.id]);
 const sorted = [...items].sort((a, b) => (a.occurrences?.start_at ?? a.occurrences?.local_date ?? '').localeCompare(b.occurrences?.start_at ?? b.occurrences?.local_date ?? ''));
 return <Screen title={t('yourDigest')}>{!session ? <Button label={t('signInForRule')} onPress={() => router.push('/account')} /> : state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' ? <Text>{t('error')}</Text> : state === 'unavailable' ? <Text>{t('digestUnavailable')}</Text> : <>
  <View style={ui.card}><Text style={ui.title}>{items.length} · {t('eventsCount')}</Text><Text style={ui.text}>{t('digestNotice')}</Text><Text style={ui.muted}>{transport === 'fixture' ? t('fixtureNotice') : transport === 'expo' ? t('pushPending') : transport === 'manual' ? t('manualDigestNotice') : t('digestUnavailable')}</Text></View>
  {sorted.map(row => row.occurrences?.events && <View key={row.occurrence_id} style={ui.card}><Text style={ui.badge}>{occurrenceTime(row.occurrences, locale, t('timeUnknown'))}</Text><Text style={ui.title}>{row.occurrences.events.title}</Text><Button variant="outline" label={t('eventDetails')} onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.occurrence_id } })} /></View>)}
 </>}</Screen>;
}
