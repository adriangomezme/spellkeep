import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// We lazy-require the native modules so a dev-client that hasn't been
// rebuilt yet (or a simulator build without them) doesn't crash on
// startup. When the modules aren't present, registerPushToken and
// subscribeToPushTaps turn into no-ops and log a single info line.
type NotificationsModule = typeof import('expo-notifications');
type DeviceModule = typeof import('expo-device');

let nativeModules: { Notifications: NotificationsModule; Device: DeviceModule } | null = null;
let loggedMissing = false;

function loadNativeModules(): { Notifications: NotificationsModule; Device: DeviceModule } | null {
  if (nativeModules) return nativeModules;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications: NotificationsModule = require('expo-notifications');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Device: DeviceModule = require('expo-device');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    nativeModules = { Notifications, Device };
    return nativeModules;
  } catch (err) {
    if (!loggedMissing) {
      loggedMissing = true;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`[push] native push modules unavailable — rebuild the dev client to enable push (${msg})`);
    }
    return null;
  }
}

function resolveExpoProjectId(): string | null {
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
 */
export async function registerPushToken(userId: string): Promise<void> {
  const mods = loadNativeModules();
  if (!mods) return;
  const { Notifications, Device } = mods;

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
  const mods = loadNativeModules();
  if (!mods) return () => {};
  const { Notifications } = mods;
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as
      | { alertId?: string; cardId?: string }
      | undefined;
    onTap(data?.alertId ?? null, data?.cardId ?? null);
  });
  return () => sub.remove();
}
