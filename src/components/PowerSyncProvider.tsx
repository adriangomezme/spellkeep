import { PowerSyncContext } from '@powersync/react';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { db, setupPowerSync } from '../lib/powersync';
import { colors, fontSize, spacing } from '../constants';

type Props = {
  children: React.ReactNode;
};

export function PowerSyncProvider({ children }: Props) {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setupPowerSync()
      .then(() => setIsReady(true))
      .catch((err) => {
        console.error('PowerSync setup error:', err);
        // Still allow the app to function without sync
        setError(err.message);
        setIsReady(true);
      });
  }, []);

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>Loading...</Text>
      </View>
    );
  }

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
