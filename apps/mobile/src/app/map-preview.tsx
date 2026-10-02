// Explicit development-only renderer acceptance fixture. No database writes or real events.
import { useState } from 'react';
import { Redirect } from 'expo-router';
import { Text } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { EventMap } from '@/components/event-map';
import { useLanguage } from '@/lib/i18n';
import type { FeedItem } from '@/lib/discovery';
const fixtures:FeedItem[]=Array.from({length:8},(_,i)=>({id:`fixture-${i}`,event_id:`fixture-event-${i}`,title:`DEMO ${i+1}`,venue:null,category_code:'other',time_kind:'unknown',start_at:null,local_date:null,timezone:'Europe/Madrid',checked_at:'2026-10-02T00:00:00Z',matched_rules:[],longitude:-3.70+i*0.008,latitude:40.42+i*0.006}));
export default function MapPreview(){const{t}=useLanguage();const[selected,setSelected]=useState<string|null>(null);if(!__DEV__)return <Redirect href="/"/>;return <Screen title={t('mapFixture')}><Text style={ui.text}>{t('mapFixtureHint')}</Text><EventMap items={fixtures} onSelect={setSelected}/>{selected&&<Text accessibilityLiveRegion="polite">DEMO · {selected}</Text>}</Screen>;}
