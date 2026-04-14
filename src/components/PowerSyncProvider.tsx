import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View, Text, StyleSheet } from 'react-native';
import { colors, fontSize, spacing } from '../constants';

type Props = {
  children: React.ReactNode;
};

export function PowerSyncProvider({ children }: Props) {
  const [isReady, setIsReady] = useState(Platform.OS === 'web');

  useEffect(() => {
    // PowerSync uses native SQLite — skip on web
    if (Platform.OS === 'web') return;

    (async () => {
      try {
        const { setupPowerSync } = await import('../lib/powersync');
        await setupPowerSync();
      } catch (err) {
        console.error('PowerSync setup error:', err);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

  // On web, render children directly (no PowerSync context)
  // On native, wrap with PowerSync context
  if (Platform.OS === 'web') {
    return <>{children}</>;
  }

  // Dynamic require to avoid web bundling native modules
  const { PowerSyncContext } = require('@powersync/react');
  const { db } = require('../lib/powersync');

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
});
