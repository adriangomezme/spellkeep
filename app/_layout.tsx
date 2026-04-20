import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '../src/constants';
import { AuthProvider } from '../src/components/AuthProvider';
import { PowerSyncProvider } from '../src/components/PowerSyncProvider';
import { ImportJobProvider } from '../src/components/collection/ImportJobProvider';
import { MinimizedImportPill } from '../src/components/collection/MinimizedImportPill';
import { ImportStatusSheet } from '../src/components/collection/ImportStatusSheet';
import { GlobalLoadingOverlay } from '../src/components/GlobalLoadingOverlay';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <AuthProvider>
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
          </ImportJobProvider>
        </PowerSyncProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
