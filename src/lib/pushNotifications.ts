import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { supabase } from './supabase';

// When the app is open we still show a banner so the user knows an alert
// fired, but suppress the sound so it's not obnoxious.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function resolveExpoProjectId(): string | null {
  // Populated by `eas init` / the EAS build.
  const easId = (Constants.expoConfig as any)?.extra?.eas?.projectId;
  if (typeof easId === 'string' && easId.length > 0) return easId;
  if (process.env.EXPO_PUBLIC_EAS_PROJECT_ID) {
    return process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  }
  return null;
}

/**
 * Ensure a push token exists for the current device + user and is upserted
 * into Supabase. Safe to call repeatedly — idempotent on `(token)`.
 *
 * No-ops (with a single info log) when:
 *   - running on a simulator (expo-notifications can't mint real tokens)
 *   - the EAS project id isn't configured
 *   - the user hasn't authenticated yet
 *   - the user denies permission
 */
export async function registerPushToken(userId: string): Promise<void> {
  if (!Device.isDevice) {
    console.log('[push] skipping token registration on simulator');
    return;
  }
  const projectId = resolveExpoProjectId();
  if (!projectId) {
    console.warn(
      '[push] EAS projectId not set — run `eas init` or set EXPO_PUBLIC_EAS_PROJECT_ID to enable push'
    );
    return;
  }

  // Android requires an explicit channel so the notification has a sound,
  // a priority, and a system-settings row the user can toggle.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('price-alerts', {
      name: 'Price alerts',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#023BFD',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') {
    console.log('[push] permission denied; skipping token upsert');
    return;
  }

  const tokenRes = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenRes.data;
  if (!token) return;

  const platform: 'ios' | 'android' =
    Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'android';

  const { error } = await supabase
    .from('device_push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' }
    );
  if (error) {
    console.warn(`[push] token upsert failed: ${error.message}`);
  } else {
    console.log('[push] token registered');
  }
}

/**
 * Subscribe to user taps on price-alert notifications and forward them to
 * the app's deep-link handler. Returns an unsubscribe function.
 */
export function subscribeToPushTaps(
  onTap: (alertId: string | null, cardId: string | null) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { alertId?: string; cardId?: string }
      | undefined;
    onTap(data?.alertId ?? null, data?.cardId ?? null);
  });
  return () => sub.remove();
}
