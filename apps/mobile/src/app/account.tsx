import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { LanguagePicker } from '@/components/language-picker';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { isLocale, locales, type Locale, type MessageKey } from '@/lib/messages';
type Mode = 'login' | 'confirm' | 'reset' | 'change';
export default function AccountScreen() {
  const { session, loading, failed, recovery, finishRecovery, retry } = useAuth();
  const { t, locale } = useLanguage();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [translation, setTranslation] = useState<Locale>('uk');
  const [timezone, setTimezone] = useState('UTC');
  useEffect(() => { if (recovery) setMode('change'); }, [recovery]);
  useEffect(() => {
    let active = true;
    setDeleting(false); setPassword(''); setCode('');
    if (session && supabase) {
      void supabase.from('profiles').select('translation_locale,notification_timezone').eq('id', session.user.id).single().then(({ data, error }) => {
        if (!active) return;
        if (error) { setMessage('error'); return; }
        if (isLocale(data?.translation_locale)) setTranslation(data.translation_locale);
        setTimezone(data?.notification_timezone ?? 'UTC');
      });
    } else { setTranslation('uk'); setTimezone('UTC'); }
    return () => { active = false; };
  }, [session?.user.id]);
  const client = supabase;
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setMessage(null);
    try { await action(); } catch { setMessage('error'); } finally { setBusy(false); }
  }
  function validateEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setMessage('invalidEmail'); return false; }
    return true;
  }
  async function authenticate(signup: boolean) {
    if (!client || !validateEmail()) return;
    if (password.length < 10) { setMessage('invalidPassword'); return; }
    await run(async () => {
      const credentials = { email: email.trim(), password };
      const response = signup ? await client.auth.signUp({ ...credentials, options: { data: { locale } } }) : await client.auth.signInWithPassword(credentials);
      if (response.error) { setMessage(signup ? 'error' : 'signInFailed'); return; }
      setPassword('');
      if (signup && !response.data.session) { setMode('confirm'); setMessage('checkEmail'); }
    });
  }
  async function verify() {
    if (!client || !validateEmail()) return;
    if (!/^\d{6}$/.test(code)) { setMessage('invalidCode'); return; }
    await run(async () => {
      const { error } = await client.auth.verifyOtp({ email: email.trim(), token: code, type: mode === 'reset' ? 'recovery' : 'signup' });
      if (error) throw error;
      setCode(''); setPassword(''); setMode(mode === 'reset' ? 'change' : 'login');
    });
  }
  return <SafeAreaView style={styles.page}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Button label={t('back')} variant="link" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <Text accessibilityRole="header" style={styles.title}>{t('account')}</Text>
    <LanguagePicker />
    {__DEV__ && process.env.EXPO_PUBLIC_SUPABASE_URL?.includes('127.0.0.1') && <Text style={styles.message}>{t('localMail')}</Text>}
    {loading ? <Text>{t('loading')}</Text> : !client ? <Text>{t('notConfigured')}</Text> : failed ? <View><Text accessibilityRole="alert">{t('sessionFailed')}</Text><Button label={t('retry')} onPress={retry} /></View> : <>
      {session && mode !== 'change' ? <>
        <Text>{t('signedIn')}: {session.user.email}</Text>
        <Text style={styles.label}>{t('translation')}</Text>
        <View style={styles.row}>{locales.map(value => <Button key={value} label={value.toUpperCase()} size="sm" variant={translation === value ? 'default' : 'outline'} disabled={busy} onPress={() => setTranslation(value)} accessibilityState={{ selected: translation === value }} />)}</View>
        <Text style={styles.label}>{t('timezone')}</Text>
        <TextInput style={styles.input} accessibilityLabel={t('timezone')} value={timezone} onChangeText={setTimezone} autoCapitalize="none" editable={!busy} />
        <Button label={t('save')} disabled={busy} onPress={() => {
          try { new Intl.DateTimeFormat('en', { timeZone: timezone.trim() }); } catch { setMessage('invalidTimezone'); return; }
          void run(async () => { const { error } = await client.from('profiles').update({ translation_locale: translation, notification_timezone: timezone.trim() }).eq('id', session.user.id); if (error) throw error; setMessage('saved'); });
        }} />
        <Button label={t('signOut')} disabled={busy} onPress={() => void run(async () => {
          const unbind = await client.from('device_tokens').delete().eq('user_id', session.user.id);
          const global = await client.auth.signOut();
          const local = await client.auth.signOut({ scope: 'local' });
          if (local.error) throw local.error;
          setMode('login'); setMessage(unbind.error || global.error ? 'localLogout' : null);
        })} />
        <Button label={t('deleteAccount')} variant="destructive" disabled={busy} onPress={() => setDeleting(true)} />
        {deleting && <View style={styles.warning}>
          <Text>{t('deleteWarning')}</Text>
          <Button label={t('confirmDelete')} variant="destructive" disabled={busy} onPress={() => void run(async () => {
            const { error } = await client.rpc('delete_my_account'); if (error) throw error;
            const cleared = await client.auth.signOut({ scope: 'local' }); if (cleared.error) throw cleared.error;
            setMode('login'); setDeleting(false);
          })} />
          <Button label={t('cancel')} variant="outline" disabled={busy} onPress={() => setDeleting(false)} />
        </View>}
      </> : <>
        {mode !== 'change' && <>
          {mode === 'confirm' && <Text accessibilityRole="header">{t('confirmEmail')}</Text>}
          {mode === 'reset' && <Text accessibilityRole="header">{t('recovery')}</Text>}
          <Text style={styles.label}>{t('email')}</Text>
          <TextInput style={styles.input} accessibilityLabel={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" editable={!busy} />
        </>}
        {(mode === 'login' || mode === 'change') && <>
          <Text style={styles.label}>{t(mode === 'change' ? 'newPassword' : 'password')}</Text>
          <TextInput style={styles.input} accessibilityLabel={t(mode === 'change' ? 'newPassword' : 'password')} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'change' ? 'new-password' : 'current-password'} editable={!busy} />
        </>}
        {mode === 'login' && <>
          <Button label={t('signIn')} disabled={busy} onPress={() => void authenticate(false)} />
          <Button label={t('signUp')} variant="outline" disabled={busy} onPress={() => void authenticate(true)} />
          <Button label={t('forgot')} variant="link" disabled={busy} onPress={() => { setMode('reset'); setPassword(''); setCode(''); setMessage(null); }} />
        </>}
        {(mode === 'confirm' || mode === 'reset') && <>
          {mode === 'reset' && <Button label={t('sendReset')} disabled={busy} onPress={() => {
            if (!validateEmail()) return;
            void run(async () => { const { error } = await client.auth.resetPasswordForEmail(email.trim()); if (error) throw error; setMessage('resetSent'); });
          }} />}
          <Text style={styles.label}>{t('code')}</Text>
          <TextInput style={styles.input} accessibilityLabel={t('code')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} editable={!busy} />
          <Button label={t('verify')} disabled={busy} onPress={() => void verify()} />
          <Button label={t('cancel')} variant="link" disabled={busy} onPress={() => { setMode('login'); setCode(''); setMessage(null); }} />
        </>}
        {mode === 'change' && <Button label={t('resetPassword')} disabled={busy} onPress={() => {
          if (password.length < 10) { setMessage('invalidPassword'); return; }
          void run(async () => { const { error } = await client.auth.updateUser({ password }); if (error) throw error; setPassword(''); finishRecovery(); setMode('login'); setMessage('passwordUpdated'); });
        }} />}
      </>}
    </>}
    {message && <Text accessibilityRole="alert" style={styles.message}>{t(message)}</Text>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5ed' },
  content: { width: '100%', maxWidth: 520, alignSelf: 'center', padding: 24, paddingBottom: 48 },
  title: { fontSize: 30, fontWeight: '700', marginBottom: 20, color: '#172817' },
  label: { marginTop: 16, marginBottom: 8, fontWeight: '600' },
  input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#809573', borderRadius: 8, padding: 12, fontSize: 16, color: '#172817' },
  row: { flexDirection: 'row', gap: 8 },
  warning: { padding: 16, borderWidth: 1, borderColor: '#aa3333', borderRadius: 8, marginTop: 12 },
  message: { marginTop: 16, lineHeight: 22, color: '#283c28' }
});
