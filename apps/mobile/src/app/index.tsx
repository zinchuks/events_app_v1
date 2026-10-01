import { useState } from 'react';
import { router } from 'expo-router';
import { LanguagePicker } from '@/components/language-picker';
import { useLanguage } from '@/lib/i18n';
import { DemoTerritories } from '@/components/demo-territories';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';

export default function WelcomeScreen() {
  const { t } = useLanguage();
  const [showAbout, setShowAbout] = useState(false);
  return (
    <SafeAreaView style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.dot} />
          <Text style={styles.wordmark}>event radar</Text>
        </View>
        <LanguagePicker />
        <Button label={t('account')} onPress={() => router.push('/account')} />
        <View style={styles.radar} accessible={false}>
          <View style={styles.radarInner}><View style={styles.radarCenter} /></View>
          <View style={styles.signal} />
        </View>
        <Text style={styles.eyebrow}>{t('eyebrow')}</Text>
        <Text accessibilityRole="header" style={styles.title}>{t('title')}</Text>
        <Text style={styles.description}>
          {t('description')}
        </Text>
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{t('preparing')}</Text>
          <Text style={styles.noticeText}>{t('empty')}</Text>
        </View>
        <Button
          label={showAbout ? t('collapse') : t('aboutButton')}
          onPress={() => setShowAbout(!showAbout)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAbout }}
          className="rounded-full bg-black px-6"
        />
        {showAbout && (
          <Text style={styles.about}>{t('about')}</Text>
        )}
        <DemoTerritories />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5ed' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 28, paddingBottom: 48 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 40 },
  dot: { width: 12, height: 12, backgroundColor: '#283c28', borderRadius: 6 },
  wordmark: { fontSize: 21, fontWeight: '700', letterSpacing: -0.6, color: '#203320' },
  radar: { width: 184, height: 184, borderRadius: 92, borderWidth: 1, borderColor: '#b4c9a6', alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 36, backgroundColor: '#e5eddf' },
  radarInner: { width: 114, height: 114, borderRadius: 57, borderWidth: 1, borderColor: '#a2b998', alignItems: 'center', justifyContent: 'center' },
  radarCenter: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#c8fa6c' },
  signal: { position: 'absolute', right: 22, top: 34, width: 14, height: 14, borderRadius: 7, backgroundColor: '#283c28' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.6, color: '#5c7051', marginBottom: 14 },
  title: { fontSize: 38, fontWeight: '700', letterSpacing: -1.4, lineHeight: 43, color: '#172817', marginBottom: 18 },
  description: { fontSize: 16, lineHeight: 25, color: '#50614a', marginBottom: 28 },
  notice: { borderTopWidth: 1, borderColor: '#d1dcc9', paddingTop: 22, marginBottom: 20 },
  noticeTitle: { fontSize: 15, fontWeight: '600', color: '#283c28', marginBottom: 6 },
  noticeText: { fontSize: 14, lineHeight: 22, color: '#50614a' },
  about: { marginTop: 16, fontSize: 14, lineHeight: 22, color: '#50614a' }
});
