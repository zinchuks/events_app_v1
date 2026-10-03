import { Text, View } from 'react-native';
import type { Json } from '@/lib/database.types';
import type { MessageKey } from '@/lib/messages';
import { useLanguage } from '@/lib/i18n';
import { ui } from '@/components/screen';
import { occurrenceTime } from '@/lib/events';
function object(v:Json|undefined){return v&&typeof v==='object'&&!Array.isArray(v)?v:null;}
export function EventChange({ snapshot }: { snapshot: Json }) {
 const { t,locale }=useLanguage();const s=object(snapshot);if(!s||typeof s.alert_kind!=='string')return null;
 const before=object(s.before);
 const fields:[string[],MessageKey][]=[[['title'],'fieldTitle'],[['venue'],'fieldVenue'],[['start_at','end_at','local_date','time_kind','timezone'],'fieldTime'],[['price','currency'],'fieldPrice'],[['category'],'fieldCategory'],[['language'],'fieldLanguage'],[['location'],'fieldLocation'],[['url'],'fieldSource'],[['status'],'fieldStatus']];
 const status=(v:NonNullable<ReturnType<typeof object>>)=>t(v.status==='cancelled'?'eventCancelled':v.status==='unknown'?'eventUnknown':'eventScheduled');
 const changed=before?fields.filter(([keys])=>keys.some(k=>JSON.stringify(before[k])!==JSON.stringify(s[k]))).map(([,label])=>t(label)):[];
 function time(v:NonNullable<ReturnType<typeof object>>){return occurrenceTime({start_at:typeof v.start_at==='string'?v.start_at:null,local_date:typeof v.local_date==='string'?v.local_date:null,timezone:typeof v.timezone==='string'?v.timezone:null},locale,t('timeUnknown'));}
 return <View style={ui.card}><Text style={ui.title}>{t(s.alert_kind==='cancelled'?'eventCancelled':s.alert_kind==='reminder'?'eventReminders':'eventChanged')}</Text>
  {s.alert_kind==='reminder'&&typeof s.lead_minutes==='number'&&<Text>{s.lead_minutes} · {t('minutesBefore')}</Text>}
  {changed.length>0&&<Text style={ui.muted}>{t('changedFields')}: {changed.join(' · ')}</Text>}
  {before&&<><Text style={ui.muted}>{t('previousDetails')}</Text><Text>{String(before.title??'')} · {time(before)}</Text>{before.status!==s.status&&<Text>{t('fieldStatus')}: {status(before)}</Text>}<Text>{String(before.venue??t('unknown'))} · {String(before.price??t('priceUnknown'))} {String(before.currency??'')}</Text></>}
  <Text style={ui.muted}>{t('updatedDetails')}</Text><Text>{String(s.title??'')} · {time(s)}</Text>{before&&before.status!==s.status&&<Text>{t('fieldStatus')}: {status(s)}</Text>}<Text>{String(s.venue??t('unknown'))} · {String(s.price??t('priceUnknown'))} {String(s.currency??'')}</Text>

 </View>;
}
