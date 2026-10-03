import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen, ui } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { LanguagePicker } from '@/components/language-picker';
import { MetricsSettings } from '@/components/metrics-settings';
import { PushSettings } from '@/components/push-settings';
import { useLanguage } from '@/lib/i18n';
import { useAuth } from '@/lib/auth-context';
export default function Settings(){const{t}=useLanguage();const{session}=useAuth();return <Screen title={t('settings')}><View style={ui.card}><LanguagePicker/><Text style={ui.muted}>{t('settingsHint')}</Text><Button label={t('account')} variant="outline" onPress={()=>router.push('/account')}/></View>{session&&<><View style={ui.card}><Button label={t('subscription')} onPress={()=>router.push('/subscription')}/></View><PushSettings/><MetricsSettings key={session.user.id}/></>}<View style={ui.card}><Text style={ui.title}>{t('yourRadar')}</Text><Button label={t('startOnboarding')} onPress={()=>router.push('/onboarding')}/><Button label={t('rules')} variant="outline" onPress={()=>router.push('/rules')}/><Text style={ui.text}>{t('schedulePending')}</Text><Text style={ui.muted}>{t('s4Coverage')}</Text></View></Screen>;}
