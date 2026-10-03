// Adapted from Obytes router layout; demo auth/providers removed.
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';
import { AuthProvider } from '@/lib/auth-context';
import { LanguageProvider } from '@/lib/i18n';
import { PushObserver } from '@/components/push-observer';
import { Uniwind } from 'uniwind';
import { MetricsProvider } from '@/lib/metrics-context';

// This shell is light-only, including when the browser's system theme is dark.
Uniwind.setTheme('light');

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AuthProvider><LanguageProvider><MetricsProvider><PushObserver /><Stack screenOptions={{ headerShown: false }} /></MetricsProvider></LanguageProvider></AuthProvider>
    </SafeAreaProvider>
  );
}
