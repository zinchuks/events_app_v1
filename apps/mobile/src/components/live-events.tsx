import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useLanguage } from '@/lib/i18n';
import { occurrenceTime, type CatalogItem } from '@/lib/events';
import type { Json } from '@/lib/database.types';
import { ui } from './screen';
type Category = { code: string; names: Json };
export function LiveEvents() {
 const { t, locale } = useLanguage(); const { session } = useAuth();
 const [items, setItems] = useState<CatalogItem[]>([]); const [categories, setCategories] = useState<Category[]>([]);
 const [selected, setSelected] = useState<string[]>([]); const [page, setPage] = useState(0);
 const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading'); const [revision, setRevision] = useState(0);
 const [sourceLoading, setSourceLoading] = useState(true);
 const [ruleLoading, setRuleLoading] = useState(false);
 const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [checked, setChecked] = useState<string | null>(null);
 useEffect(() => { let active = true; const client = supabase; if (!client) return;
  void Promise.all([client.from('categories').select('code,names').order('code'), client.from('sources').select('last_success_at').eq('url', 'https://datos.madrid.es/dataset/300107-0-agenda-actividades-eventos/information').maybeSingle()]).then(([cats, source]) => { if (!active) return; if (cats.data) setCategories(cats.data); setChecked(source.data?.last_success_at ?? null); setSourceLoading(false); });
  return () => { active = false; };
 }, [revision]);
 useEffect(() => { let active = true; setSelected([]); setPage(0); setMessage(''); setRuleLoading(Boolean(session));
  if (session && supabase) void supabase.from('rules').select('filters').eq('user_id', session.user.id).eq('filters->>scope', 's3').maybeSingle().then(({ data }) => {
   if (!active) return; setRuleLoading(false);
   const filters = data?.filters;
   if (filters && typeof filters === 'object' && !Array.isArray(filters) && Array.isArray(filters.categories)) setSelected(filters.categories.filter((v): v is string => typeof v === 'string'));
  });
  return () => { active = false; };
 }, [session?.user.id]);
 useEffect(() => { let active = true;
  setState('loading');
  if (!supabase) { setState('error'); return; }
  void supabase.rpc('list_s3_events', { category_codes: selected, page_offset: page * 30 }).then(({ data, error }) => {
   if (!active) return; if (error) { setState('error'); return; } setItems(data ?? []); setState('ready');
  });
  return () => { active = false; };
 }, [selected, page, revision]);
 async function build() {
  if (!session || !supabase || busy) return;
  setBusy(true); setMessage('');
  try {
   const rule = await supabase.rpc('save_s3_rule', { category_codes: selected }); if (rule.error) throw rule.error;
   const digest = await supabase.rpc('build_s3_digest', { selected_rule: rule.data }); if (digest.error) throw digest.error;
   if (digest.data) router.push({ pathname: '/digest/[id]', params: { id: digest.data } }); else setMessage(t('noMatches'));
  } catch { setMessage(t('error')); } finally { setBusy(false); }
 }
 const fresh = checked && Date.now() - new Date(checked).getTime() < 48 * 3600000;
 return <>
  <View style={ui.card}><Text style={ui.badge}>{t('city')} · Madrid</Text><Text style={ui.text}>{t('s3Coverage')}</Text><Text style={ui.muted}>Ayuntamiento de Madrid · CC BY 4.0</Text>
   <Text style={ui.muted}>{sourceLoading ? t('loading') : checked ? `${t('checked')}: ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(checked))}` : t('sourceUnavailable')}</Text>
   {!sourceLoading && !fresh && <Text accessibilityRole="alert" style={ui.text}>{t('sourceStale')}</Text>}
  </View>
  <View style={ui.card}><Text style={ui.title}>{t('yourInterests')}</Text><Text style={ui.muted}>{t('categoryHint')}</Text>
   <View style={ui.row}><Button size="sm" label={t('allCategories')} variant={selected.length === 0 ? 'default' : 'outline'} disabled={busy || ruleLoading} onPress={() => { setSelected([]); setPage(0); }} />
   {categories.map(cat => <Button key={cat.code} size="sm" label={typeof cat.names === 'object' && cat.names && !Array.isArray(cat.names) ? String(cat.names[locale] ?? cat.code) : cat.code} variant={selected.includes(cat.code) ? 'default' : 'outline'} disabled={busy || ruleLoading} accessibilityState={{ selected: selected.includes(cat.code) }} onPress={() => { setSelected(values => values.includes(cat.code) ? values.filter(v => v !== cat.code) : [...values, cat.code]); setPage(0); }} />)}</View>
   <Text style={ui.muted}>{t('horizon')}</Text>
   {session ? <Button label={busy ? t('loading') : t('buildDigest')} disabled={busy || ruleLoading || !fresh} onPress={() => void build()} /> : <Button label={t('signInForRule')} onPress={() => router.push('/account')} />}
   {Boolean(message) && <Text accessibilityRole="alert">{message}</Text>}
  </View>
  <Text accessibilityRole="header" style={ui.title}>{t('liveEvents')}</Text>
  {state === 'loading' ? <Text>{t('loading')}</Text> : state === 'error' ? <Text accessibilityRole="alert">{t('error')}</Text> : items.length === 0 ? <Text style={ui.text}>{t('noMatches')}</Text> : items.map(item => <View key={item.id} style={ui.card}>
   <Text style={ui.badge}>{occurrenceTime(item, locale, t('timeUnknown'))}</Text><Text accessibilityRole="header" style={ui.title}>{item.title}</Text>
   {item.venue && <Text style={ui.text}>{item.venue}</Text>}<Button label={t('eventDetails')} variant="outline" onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })} />
  </View>)}
  <View style={ui.row}><Button label={t('previous')} size="sm" variant="outline" disabled={page === 0 || state === 'loading'} onPress={() => setPage(p => p - 1)} /><Text style={ui.text}>{page + 1}</Text><Button label={t('next')} size="sm" variant="outline" disabled={items.length < 30 || state === 'loading'} onPress={() => setPage(p => p + 1)} /></View>
  <Button label={t('refreshEvents')} variant="link" onPress={() => setRevision(value => value + 1)} />
 </>;
}
