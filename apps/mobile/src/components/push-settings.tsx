import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button } from './ui/button';
import { ui } from './screen';
import { enablePush } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
export function PushSettings() {
 const { session } = useAuth(); const { t } = useLanguage(); const [enabled, setEnabled] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<MessageKey | null>(null);
 useEffect(() => { let active = true; setEnabled(false); if (session && supabase) void supabase.from('profiles').select('push_enabled').eq('id', session.user.id).single().then(({ data, error }) => { if (active) { setEnabled(data?.push_enabled ?? false); if (error) setMessage('error'); } }); return () => { active = false; }; }, [session?.user.id]);
 async function toggle() {
  if (!supabase || !session || busy) return; setBusy(true); setMessage(null);
  try {
   if (enabled) {
    const result = await supabase.from('profiles').update({ push_enabled: false }).eq('id', session.user.id); if (result.error) throw result.error;
    const removed = await supabase.from('device_tokens').delete().eq('user_id', session.user.id); if (removed.error) throw removed.error;
    setEnabled(false); setMessage('pushDisabled');
   } else { const result = await enablePush(); setMessage(result); if (result === 'pushEnabled') setEnabled(true); }
  } catch { setMessage('error'); } finally { setBusy(false); }
 }
 return <View style={ui.card}><Text style={ui.title}>{t('notifications')}</Text><Text style={ui.text}>{t(Platform.OS==='web'?'pushBrowser':'pushDevelopment')}</Text>{(Platform.OS!=='web'||enabled)&&<Button label={enabled ? t('disablePush') : t('enablePush')} variant="outline" disabled={busy} onPress={() => void toggle()} />}{message && <Text accessibilityRole="alert" style={ui.muted}>{t(message)}</Text>}</View>;
}
