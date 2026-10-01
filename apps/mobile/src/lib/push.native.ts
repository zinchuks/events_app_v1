import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';
import type { MessageKey } from './messages';
Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }) });
export async function enablePush(): Promise<MessageKey> {
 if (!Device.isDevice || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'pushNeedsBuild';
 const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
 if (!projectId) return 'pushNeedsProject';
 if (!supabase) return 'error';
 if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('digests', { name: 'Event Radar', importance: Notifications.AndroidImportance.DEFAULT });
 let permissions = await Notifications.getPermissionsAsync();
 if (!permissions.granted) permissions = await Notifications.requestPermissionsAsync();
 if (!permissions.granted) return 'pushDenied';
 const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
 const { error } = await supabase.rpc('register_push_device', { expo_token: token, device_platform: Platform.OS });
 if (error) throw error;
 return 'pushEnabled';
}
export { Notifications };
