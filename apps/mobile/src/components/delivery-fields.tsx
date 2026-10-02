import { Text, View } from 'react-native';
import { Field, Toggle } from './rule-fields';
import { Button } from './ui/button';
import { ui } from './screen';
import { useLanguage } from '@/lib/i18n';
import type { DeliveryPreferences } from '@/lib/discovery';
import type { MessageKey } from '@/lib/messages';
export function DeliveryFields({value,onChange,timezone,onTimezone}:{value:DeliveryPreferences;onChange(v:DeliveryPreferences):void;timezone:string;onTimezone(v:string):void}){
 const{t,locale}=useLanguage();const modes=['manual','daily','weekdays','interval'] as const;const keys:MessageKey[]=['manualMode','dailyMode','weekdaysMode','intervalMode'];
 return <View style={{gap:12}}><Text style={ui.text}>{t('schedulePending')}</Text><View style={ui.row}>{modes.map((m,i)=><Button key={m} size="sm" label={t(keys[i])} variant={value.mode===m?'default':'outline'} accessibilityState={{selected:value.mode===m}} onPress={()=>onChange({...value,mode:m,active:m==='manual'?false:value.active})}/>)}</View>
 <Field label={t('ruleTimezone')} value={timezone} onChange={onTimezone}/>
 {value.mode!=='manual'&&<Field label={t('deliveryTime')} value={value.time??'18:00'} onChange={time=>onChange({...value,time})}/>}
 {value.mode==='weekdays'&&<View style={ui.row}>{[1,2,3,4,5,6,7].map(n=>{const selected=value.weekdays?.includes(n);const name=new Intl.DateTimeFormat(locale,{weekday:'short',timeZone:'UTC'}).format(new Date(Date.UTC(2026,0,4+n)));return <Button key={n} size="sm" label={name} accessibilityState={{selected:Boolean(selected)}} variant={selected?'default':'outline'} onPress={()=>onChange({...value,weekdays:selected?value.weekdays?.filter(v=>v!==n):[...(value.weekdays??[]),n]})}/>;})}</View>}
 {value.mode==='interval'&&<><Field label={t('intervalDays')} value={String(value.days??7)} numeric onChange={days=>onChange({...value,days:Number(days)})}/><Field label={t('anchorDate')} value={value.anchor??''} onChange={anchor=>onChange({...value,anchor})}/></>}
 {value.mode!=='manual'&&<><Toggle label={t('automaticSelections')} value={Boolean(value.active)} onChange={active=>onChange({...value,active})}/><Toggle label={t('repeatUnchanged')} value={Boolean(value.repeat_unchanged)} onChange={repeat_unchanged=>onChange({...value,repeat_unchanged})}/><Toggle label={t('quietHours')} value={Boolean(value.quiet)} onChange={enabled=>onChange({...value,quiet:enabled?{start:'22:00',end:'08:00'}:undefined})}/>{value.quiet&&<><Field label={t('quietStart')} value={value.quiet.start} onChange={start=>onChange({...value,quiet:{...value.quiet!,start}})}/><Field label={t('quietEnd')} value={value.quiet.end} onChange={end=>onChange({...value,quiet:{...value.quiet!,end}})}/></>}<Text style={ui.muted}>{t('scheduleHint')}</Text></>}
 </View>;
}
