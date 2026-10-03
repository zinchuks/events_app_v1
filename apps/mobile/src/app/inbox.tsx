import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import type { Database } from '@/lib/database.types';
import { PushSettings } from '@/components/push-settings';
type Digest = Database['public']['Tables']['digests']['Row'];
export default function InboxScreen() {
 const { t, locale } = useLanguage(); const { session,loading } = useAuth(); const [items, setItems] = useState<Digest[]>([]); const [state, setState] = useState('loading'); const [page,setPage]=useState(0); const [revision, setRevision] = useState(0);
 useEffect(()=>{setPage(0);},[session?.user.id]);
 useFocusEffect(useCallback(() => { let active = true; setItems([]);
  if (!session || !supabase) { setState('ready'); return; } setState('loading');
  void supabase.from('digests').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).range(page*20,page*20+19).then(({ data, error }) => { if (active) { setItems(data ?? []); setState(error ? 'error' : 'ready'); } });
  return () => { active = false; };
 }, [session?.user.id,page,revision]));
 return <Screen title={t('inbox')}>{loading ? <Text>{t('loading')}</Text> : !session ? <Button label={t('signInForRule')} onPress={() => router.push('/account')} /> : <>
  <PushSettings />
  {state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' ? <View style={ui.card}><Text accessibilityRole="alert">{t('error')}</Text><Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></View> : items.length === 0 ? <View style={ui.card}><Text style={ui.text}>{t('noDigests')}</Text><Button label={t('browse')} onPress={() => router.replace('/')} /></View> : items.map(item => <View key={item.id} style={ui.card}><Text style={ui.badge}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</Text><Text style={ui.title}>{item.rule_name === 'S8:changed' ? t('eventChanged') : item.rule_name === 'S8:cancelled' ? t('eventCancelled') : item.rule_name === 'S8:reminder' ? t('eventReminders') : item.rule_name === 'S7' ? t('scheduledDigest') : item.rule_name === 'S4' ? t('ruleMatches') : item.rule_name ?? 'Madrid'}</Text><Text style={ui.muted}>{item.horizon_start && item.horizon_end ? `${item.horizon_start} — ${item.horizon_end}` : t(item.rule_name?.startsWith('S8:')?'changeAfterImport':item.rule_name==='S7'?'scheduleHistoryHint':'manualDigest')}</Text><Button label={t('openDigest')} variant="outline" onPress={() => router.push({ pathname: '/digest/[id]', params: { id: item.id } })} /></View>)}
  <View style={ui.row}><Button label={t('previous')} variant="outline" disabled={page===0||state==='loading'} onPress={()=>setPage(v=>v-1)}/><Text>{page+1}</Text><Button label={t('next')} variant="outline" disabled={items.length<20||state==='loading'} onPress={()=>setPage(v=>v+1)}/></View>
  <Button label={t('refreshEvents')} variant="link" onPress={() => setRevision(v => v + 1)} />
 </>}</Screen>;
}
