import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useAuthContext } from './AuthProvider';
import { registerPushToken, subscribeToPushTaps } from '../lib/pushNotifications';

/**
 * Mount this inside <AuthProvider>. It registers the device's push token
 * the first time a non-anonymous session is available and every time the
 * user id changes, and forwards notification taps to /alerts with the
 * alert id as `focusId`.
 */
export function PushNotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, isAnonymous } = useAuthContext();
  const router = useRouter();
  const lastRegisteredUser = useRef<string | null>(null);

  useEffect(() => {
    // Anonymous accounts don't need push — tokens live with real accounts.
    if (!user || isAnonymous) return;
    if (lastRegisteredUser.current === user.id) return;
    lastRegisteredUser.current = user.id;
    registerPushToken(user.id).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[push] registration failed: ${msg}`);
    });
  }, [user, isAnonymous]);

  useEffect(() => {
    // Tapping a price-alert push drops the user on the Triggered tab.
    // No focus id, no row highlight — the "NEW" pill on each fresh
    // event already makes it obvious which entry fired.
    const unsubscribe = subscribeToPushTaps(() => {
      router.push({ pathname: '/alerts', params: { tab: 'triggered' } });
    });
    return unsubscribe;
  }, [router]);

  return <>{children}</>;
}
