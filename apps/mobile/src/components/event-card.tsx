import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { ui } from './screen';
import { Button } from './ui/button';
import { occurrenceTime } from '@/lib/events';
import { useLanguage } from '@/lib/i18n';
import type { FeedItem } from '@/lib/discovery';
export function EventCard({item,names={}}:{item:FeedItem;names?:Record<string,string>}){
 const{t,locale}=useLanguage();
 return <View style={ui.card}><Text style={ui.badge}>{occurrenceTime(item,locale,t('timeUnknown'))}</Text><Text accessibilityRole="header" style={ui.title}>{item.title}</Text>{Boolean(item.venue)&&<Text style={ui.text}>{item.venue}</Text>}{item.matched_rules.length>0&&<Text style={ui.muted}>{item.matched_rules.map(id=>names[id]).filter(Boolean).join(' · ')}</Text>}<Button label={t('eventDetails')} variant="outline" onPress={()=>router.push({pathname:'/event/[id]',params:{id:item.id}})}/></View>;
}
