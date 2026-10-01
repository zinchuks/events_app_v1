import { useEffect } from 'react';
import { router } from 'expo-router';
import { Notifications } from '@/lib/push.native';
import { useAuth } from '@/lib/auth-context';
export function PushObserver() {
 const { session } = useAuth();
 useEffect(() => {
  function open(notification: Notifications.Notification) {
   const id = notification.request.content.data?.digest_id;
   if (!session || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
   router.push({ pathname: '/digest/[id]', params: { id } });
   void Notifications.clearLastNotificationResponseAsync();
  }
  const response = Notifications.getLastNotificationResponse(); if (response) open(response.notification);
  const subscription = Notifications.addNotificationResponseReceivedListener(response => open(response.notification));
  return () => subscription.remove();
 }, [session?.user.id]);
 return null;
}
