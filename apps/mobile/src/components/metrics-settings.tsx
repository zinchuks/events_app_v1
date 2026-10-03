import { useState } from 'react';
import { Text, View } from 'react-native';
import { Toggle } from './rule-fields';
import { ui } from './screen';
import { Button } from './ui/button';
import { useMetrics } from '@/lib/metrics-context';
import { useLanguage } from '@/lib/i18n';
export function MetricsSettings() {
 const { enabled, ready, failed, retry, setEnabled } = useMetrics(); const { t } = useLanguage();
 const [busy, setBusy] = useState(false); const [error, setError] = useState<boolean | null>(null);
 async function change(next: boolean) { setBusy(true); setError(null); try { await setEnabled(next); } catch { setError(next); } finally { setBusy(false); } }
 return <View style={ui.card}><Text style={ui.title}>{t('metricsTitle')}</Text><Text style={ui.text}>{t('metricsExplanation')}</Text>
  <Toggle label={t('metricsConsent')} value={enabled} disabled={!ready || busy} onChange={next => void change(next)} />
  {!ready && (failed?<><Text style={ui.muted}>{t('metricsUnavailable')}</Text><Button label={t('retry')} onPress={retry} /></>:<Text style={ui.muted}>{t('loading')}</Text>)}
  <Text style={ui.muted}>{t('metricsRemoval')}</Text>
  {error !== null && <><Text accessibilityRole="alert">{t('error')}</Text><Button label={t('retry')} onPress={() => void change(error)} /></>}
 </View>;
}
