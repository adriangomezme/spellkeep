import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View, StyleSheet } from 'react-native';
import { colors } from '../constants';
import {
  clearSyncReset,
  useSyncResetAt,
} from '../lib/auth/syncResetAt';
import { SyncSplash } from './SyncSplash';

type Props = {
  children: React.ReactNode;
};

export function PowerSyncProvider({ children }: Props) {
  const [isReady, setIsReady] = useState(Platform.OS === 'web');

  useEffect(() => {
    if (Platform.OS === 'web') return;

    (async () => {
      try {
        const { setupPowerSync } = await import('../lib/powersync');
        await setupPowerSync();
        const { initPriceOverrides } = await import('../lib/pricing/priceOverrides');
        await initPriceOverrides();
      } catch (err) {
        console.error('PowerSync setup error:', err);
      } finally {
        setIsReady(true);
      }

      // Open the catalog DB (if a snapshot already exists locally) and
      // then kick off a background refresh. Both steps are non-blocking:
      // the app renders immediately and search falls back to the Scryfall
      // API while the catalog is prepared.
      try {
        const { openCatalog } = await import('../lib/catalog/catalogDb');
        const FileSystem = await import('expo-file-system/legacy');
        const path = `${FileSystem.documentDirectory}catalog.db`;
        const exists = (await FileSystem.getInfoAsync(path)).exists;
        if (exists) {
          try { openCatalog(); } catch (err) { console.warn('Catalog open skipped:', err); }
        }
      } catch (err) {
        console.error('Catalog open error:', err);
      }

      try {
        const { ensureCatalogFresh } = await import('../lib/catalog/catalogSync');
        ensureCatalogFresh()
          .then(async () => {
            // Warm just the set-icon URI map (a ~1031-row SELECT,
            // ~200 KB in memory, no network). Means the first card
            // open of the session renders its set glyph on first frame.
            // We deliberately do NOT prefetch the SVG bytes — expo-image
            // handles disk caching on demand.
            try {
              const { ensureSetIconsLoaded } = await import('../lib/catalog/catalogDb');
              ensureSetIconsLoaded().catch(() => {});
            } catch {}
          })
          .catch((err) => {
            console.error('Catalog sync error:', err);
          });
      } catch (err) {
        console.error('Catalog sync boot error:', err);
      }
    })();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return <>{children}</>;
  }

  const { PowerSyncContext } = require('@powersync/react');
  const { db } = require('../lib/powersync');

  return (
    <PowerSyncContext.Provider value={db}>
      <FirstSyncGate>{children}</FirstSyncGate>
    </PowerSyncContext.Provider>
  );
}

// Blocking splash while the current user's local DB is catching up
// to the server after a session switch (logout+login, anon → real,
// account A → B). Gated by a timestamp comparison (not a boolean)
// because PowerSync does not reset `hasSynced` on disconnect — we
// need to know "has a sync pass happened AFTER our wipe", which is
// `status.lastSyncedAt > resetAt`.
function FirstSyncGate({ children }: { children: React.ReactNode }) {
  const resetAt = useSyncResetAt();
  const { useStatus } = require('@powersync/react');
  const status = useStatus();

  const lastSyncedMs = status?.lastSyncedAt
    ? (status.lastSyncedAt instanceof Date
        ? status.lastSyncedAt.getTime()
        : new Date(status.lastSyncedAt).getTime())
    : null;

  const syncedSinceReset =
    resetAt != null && lastSyncedMs != null && lastSyncedMs >= resetAt;

  useEffect(() => {
    if (resetAt != null && syncedSinceReset) {
      clearSyncReset().catch(() => {});
    }
  }, [resetAt, syncedSinceReset]);

  if (resetAt != null && !syncedSinceReset) {
    return <SyncSplash />;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
