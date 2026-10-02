import { useCallback, useEffect, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { Text, View } from 'react-native';
import type { QueryData } from '@supabase/supabase-js';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { eventSelect, occurrenceTime } from '@/lib/events';
function query() { return supabase!.from('saved_events').select(`occurrence_id,occurrences(${eventSelect})`); }
type Items = QueryData<ReturnType<typeof query>>;
export default function SavedScreen() {
 const { t, locale } = useLanguage(); const { session,loading } = useAuth(); const [items, setItems] = useState<Items>([]); const [state, setState] = useState('loading'); const [page,setPage]=useState(0); const [revision,setRevision]=useState(0);
 useEffect(()=>{setPage(0);},[session?.user.id]);
 useFocusEffect(useCallback(() => { let active = true; setItems([]);
  if (!session || !supabase) { setState('ready'); return; } setState('loading');
  void query().eq('user_id', session.user.id).order('created_at', { ascending: false }).range(page*20,page*20+19).then(({ data, error }) => { if (active) { setItems(data ?? []); setState(error ? 'error' : 'ready'); } });
  return () => { active = false; };
 }, [session?.user.id,page,revision]));
 return <Screen title={t('savedEvents')}>{loading ? <Text>{t('loading')}</Text> : !session ? <Button label={t('signInToSave')} onPress={() => router.push('/account')} /> : state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' ? <View style={ui.card}><Text accessibilityRole="alert">{t('error')}</Text><Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></View> : items.length === 0 ? <Text style={ui.text}>{t('noSavedEvents')}</Text> : items.map(row => row.occurrences?.events && <View key={row.occurrence_id} style={ui.card}><Text style={ui.badge}>{occurrenceTime(row.occurrences, locale, t('timeUnknown'))}</Text><Text style={ui.title}>{row.occurrences.events.title}</Text><Button variant="outline" label={t('eventDetails')} onPress={() => router.push({ pathname: '/event/[id]', params: { id: row.occurrence_id } })} /></View>)}{session&&<><View style={ui.row}><Button label={t('previous')} variant="outline" disabled={page===0||state==='loading'} onPress={()=>setPage(v=>v-1)}/><Text>{page+1}</Text><Button label={t('next')} variant="outline" disabled={items.length<20||state==='loading'} onPress={()=>setPage(v=>v+1)}/></View><Button label={t('refreshEvents')} variant="link" onPress={()=>setRevision(v=>v+1)}/></>}</Screen>;
}
