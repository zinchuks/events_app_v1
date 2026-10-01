import { useEffect, useState } from 'react';
import { router } from 'expo-router';
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
 const { t, locale } = useLanguage(); const { session } = useAuth(); const [items, setItems] = useState<Digest[]>([]); const [state, setState] = useState('loading'); const [revision, setRevision] = useState(0);
 useEffect(() => { let active = true; setItems([]);
  if (!session || !supabase) { setState('ready'); return; } setState('loading');
  void supabase.from('digests').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50).then(({ data, error }) => { if (active) { setItems(data ?? []); setState(error ? 'error' : 'ready'); } });
  return () => { active = false; };
 }, [session?.user.id, revision]);
 return <Screen title={t('inbox')}>{!session ? <Button label={t('signInForRule')} onPress={() => router.push('/account')} /> : <>
  <PushSettings />
  {state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' ? <Text>{t('error')}</Text> : items.length === 0 ? <View style={ui.card}><Text style={ui.text}>{t('noDigests')}</Text><Button label={t('browse')} onPress={() => router.replace('/')} /></View> : items.map(item => <View key={item.id} style={ui.card}><Text style={ui.badge}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.created_at))}</Text><Text style={ui.title}>{item.rule_name ?? 'Madrid'}</Text><Text style={ui.muted}>{item.horizon_start} — {item.horizon_end}</Text><Button label={t('openDigest')} variant="outline" onPress={() => router.push({ pathname: '/digest/[id]', params: { id: item.id } })} /></View>)}
  <Button label={t('refreshEvents')} variant="link" onPress={() => setRevision(v => v + 1)} />
 </>}</Screen>;
}
