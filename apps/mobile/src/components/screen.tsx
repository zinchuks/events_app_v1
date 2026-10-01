import type { PropsWithChildren } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from './ui/button';
import { useLanguage } from '@/lib/i18n';
import { LanguagePicker } from './language-picker';
export function Screen({ children, title, home = false }: PropsWithChildren<{ title: string; home?: boolean }>) {
 const { t } = useLanguage();
 return <SafeAreaView style={ui.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={ui.content}>
  <View style={ui.brand}><Text style={ui.wordmark}>● event radar</Text><Button size="sm" variant="outline" label={t('account')} onPress={() => router.push('/account')} /></View>
  {!home && <Button variant="link" label={t('back')} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />}
  <Text accessibilityRole="header" style={ui.heading}>{title}</Text>
  <View style={ui.row}><Button size="sm" variant="outline" label={t('browse')} onPress={() => router.replace('/')} /><Button size="sm" variant="outline" label={t('savedEvents')} onPress={() => router.push('/saved')} /><Button size="sm" variant="outline" label={t('inbox')} onPress={() => router.push('/inbox')} /></View>
  {home && <LanguagePicker />}
  {children}
 </ScrollView></SafeAreaView>;
}
export const ui = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f1f5ed' }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', padding: 22, paddingBottom: 48, gap: 18 }, brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, wordmark: { fontSize: 23, fontWeight: '700', color: '#203320', letterSpacing: -0.7 }, heading: { fontSize: 32, fontWeight: '700', color: '#172817', letterSpacing: -0.8 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, card: { backgroundColor: 'white', padding: 18, borderRadius: 16, gap: 12, borderWidth: 1, borderColor: '#dce6d5' }, title: { fontSize: 20, fontWeight: '600', color: '#172817' }, text: { fontSize: 15, lineHeight: 23, color: '#40533a' }, muted: { fontSize: 12, lineHeight: 18, color: '#53644b' }, badge: { fontSize: 12, fontWeight: '700', color: '#42652d' } });
