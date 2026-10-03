// Adapted from Obytes; own provisional app IDs, no upstream account/project/secret.
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { getVariant } from './config/variants.mjs';
import { assertBetaConfig } from './config/beta.mjs';

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, id, scheme, variant } = getVariant(process.env.APP_VARIANT);
  const projectId = process.env.EAS_PROJECT_ID;
  if (process.env.EAS_BUILD_PROFILE === 'beta') assertBetaConfig({ variant, projectId, url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY });
  if (projectId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
    throw new Error('EAS_PROJECT_ID must be your own project UUID.');
  }
  return {
    ...config,
    name,
    slug: 'event-radar',
    version: '0.1.0',
    scheme,
    orientation: 'portrait',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    ios: { bundleIdentifier: id, supportsTablet: true },
    android: { package: id },
    web: { bundler: 'metro', output: 'single' },
    plugins: ['expo-router', 'expo-splash-screen', 'expo-secure-store', 'expo-notifications', '@maplibre/maplibre-react-native'],
    extra: { appVariant: variant, ...(projectId ? { eas: { projectId } } : {}) }
  };
};
