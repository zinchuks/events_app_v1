import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/i18n';
import type { Database } from '@/lib/database.types';
type Territory = Pick<Database['public']['Tables']['territories']['Row'], 'id' | 'names'>;
export function DemoTerritories() {
  const { t, locale } = useLanguage();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void supabase.from('territories').select('id,names').eq('is_demo', true).order('external_id').then(({ data, error }) => {
      if (active) { setUnavailable(Boolean(error)); setTerritories(data ?? []); }
    });
    return () => { active = false; };
  }, []);
  if (!supabase) return null;
  return <View style={{ marginTop: 24 }}>
    <Text accessibilityRole="header" style={{ fontWeight: '600', marginBottom: 8 }}>{t('demoTerritories')}</Text>
    <Text style={{ lineHeight: 22 }}>{t('demoNotice')}</Text>
    {unavailable && <Text>{t('noTerritories')}</Text>}
    {territories.map(territory => {
      const names = territory.names;
      const name = names && typeof names === 'object' && !Array.isArray(names) ? names[locale] : null;
      return typeof name === 'string' ? <Text key={territory.id} style={{ marginTop: 6 }}>{name}</Text> : null;
    })}
  </View>;
}
