import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
type Coverage = { code: 'madrid'|'toronto'|'helsinki'; name: string; url: string; license: string; fresh: boolean; last_success_at: string|null; future_sessions: number; mapped: number; known_prices: number };
export default function SourcesScreen() {
 const { t, locale } = useLanguage(); const [rows,setRows]=useState<Coverage[]>([]); const [state,setState]=useState('loading'); const [revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setState('loading');void(async()=>{
  if(!supabase)throw Error('Unavailable');const {data,error}=await supabase.rpc('s6_source_coverage');if(error)throw error;
  if(active){setRows(data as unknown as Coverage[]);setState('ready');}
 })().catch(()=>{if(active)setState('error');});return()=>{active=false;};},[revision]);
 return <Screen title={t('sourcesHeading')}><Text style={ui.text}>{t('sourceCoverageHint')}</Text>
  {state==='loading'?<Text>{t('loading')}</Text>:state==='error'?<View style={ui.card}><Text accessibilityRole="alert">{t('error')}</Text><Button label={t('retry')} onPress={()=>setRevision(v=>v+1)}/></View>:rows.map(row=><View key={row.code} style={ui.card}>
   <Text accessibilityRole="header" style={ui.title}>{row.code==='madrid'?'Madrid · ES':row.code==='toronto'?'Toronto · CA':'Helsinki · FI'}</Text>
   <Text style={ui.badge}>{row.fresh?t('freshData'):t('staleData')}</Text>
   <Text style={ui.text}>{t(row.code==='madrid'?'madridCoverage':row.code==='toronto'?'torontoCoverage':'helsinkiCoverage')}</Text>
   <Text style={ui.text}>{t('resultsCount')}: {row.future_sessions} · {t('mappedCount')}: {row.mapped} · {t('knownPrices')}: {row.known_prices}</Text>
   <Text style={ui.muted}>{t('checked')}: {row.last_success_at?new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short'}).format(new Date(row.last_success_at)):t('noSourceFetch')}</Text>
   <Text style={ui.muted}>{row.name}</Text><View style={ui.row}><Button label={t('openOriginal')} variant="link" onPress={()=>void Linking.openURL(row.url)}/><Button label={t('sourceLicense')} variant="link" onPress={()=>void Linking.openURL(row.license)}/></View>
  </View>)}
 </Screen>;
}
