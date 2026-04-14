import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/constants';
import { AuthProvider } from '../src/components/AuthProvider';
import { PowerSyncProvider } from '../src/components/PowerSyncProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <PowerSyncProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </PowerSyncProvider>
    </AuthProvider>
  );
}
