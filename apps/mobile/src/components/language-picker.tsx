import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from './ui/button';
import { useLanguage } from '@/lib/i18n';
import { locales } from '@/lib/messages';
const names = { uk: 'Українська', en: 'English', es: 'Español' };
export function LanguagePicker() {
  const { t, locale, setLocale } = useLanguage();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  return <View style={{ marginBottom: 16 }}>
    <Text>{t('language')}</Text>
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {locales.map(value => <Button key={value} label={names[value]} size="sm" variant={value === locale ? 'default' : 'outline'}
        disabled={busy} accessibilityRole="button" accessibilityState={{ selected: value === locale }}
        onPress={() => { setBusy(true); setFailed(false); void setLocale(value).catch(() => setFailed(true)).finally(() => setBusy(false)); }} />)}
    </View>
    {failed && <Text accessibilityRole="alert">{t('error')}</Text>}
  </View>;
}
