import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { colors } from '../src/constants';
import { AuthProvider } from '../src/components/AuthProvider';
import { PowerSyncProvider } from '../src/components/PowerSyncProvider';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <AuthProvider>
        <PowerSyncProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
            }}
          />
        </PowerSyncProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
