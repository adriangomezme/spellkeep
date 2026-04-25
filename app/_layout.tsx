import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { colors } from '../src/constants';
import { AuthProvider } from '../src/components/AuthProvider';
import { PushNotificationsProvider } from '../src/components/PushNotificationsProvider';
import { PowerSyncProvider } from '../src/components/PowerSyncProvider';
import { ImportJobProvider } from '../src/components/collection/ImportJobProvider';
import { MinimizedImportPill } from '../src/components/collection/MinimizedImportPill';
import { ImportStatusSheet } from '../src/components/collection/ImportStatusSheet';
import { GlobalLoadingOverlay } from '../src/components/GlobalLoadingOverlay';
import { Toast } from '../src/components/Toast';

export default function RootLayout() {
  // mana-font (Andrew Gioia, OFL) — official-style MTG glyphs used
  // in Group By headers (rarity gems + type symbols). Non-blocking
  // load: callers render the fallback text until the font is ready.
  useFonts({ Mana: require('../assets/fonts/Mana.ttf') });

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <AuthProvider>
        <PushNotificationsProvider>
        <PowerSyncProvider>
          <ImportJobProvider>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            />
            <MinimizedImportPill />
            <ImportStatusSheet />
            <GlobalLoadingOverlay />
            <Toast />
          </ImportJobProvider>
        </PowerSyncProvider>
        </PushNotificationsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
