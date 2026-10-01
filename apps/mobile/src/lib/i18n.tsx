import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { messages, isLocale, type Locale, type MessageKey } from './messages';
import { sessionStorage } from './session-storage';
import { supabase } from './supabase';
import { useAuth } from './auth-context';
type Language = { locale: Locale; t(key: MessageKey): string; setLocale(locale: Locale): Promise<void> };
const Context = createContext<Language>({ locale: 'uk', t: key => messages.uk[key], setLocale: async () => {} });
export function LanguageProvider({ children }: PropsWithChildren) {
  const [locale, updateLocale] = useState<Locale>('uk');
  const choice = useRef(0);
  const { session } = useAuth();
  useEffect(() => {
    let active = true;
    const version = choice.current;
    void sessionStorage.getItem('event-radar-locale').then(value => { if (active && choice.current === version && isLocale(value)) updateLocale(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const version = choice.current;
    if (session && supabase) {
      void supabase.from('profiles').select('locale').eq('id', session.user.id).single().then(({ data }) => {
        if (active && choice.current === version && isLocale(data?.locale)) updateLocale(data.locale);
      });
    }
    return () => { active = false; };
  }, [session?.user.id]);
  async function setLocale(next: Locale) {
    choice.current++;
    if (session && supabase) {
      const { error } = await supabase.from('profiles').update({ locale: next }).eq('id', session.user.id);
      if (error) throw error;
    }
    await sessionStorage.setItem('event-radar-locale', next);
    updateLocale(next);
  }
  return <Context.Provider value={{ locale, t: key => messages[locale][key], setLocale }}>{children}</Context.Provider>;
}
export const useLanguage = () => useContext(Context);
