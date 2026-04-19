import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View, StyleSheet } from 'react-native';
import { colors } from '../constants';

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
            // Warm expo-image's disk cache with every set glyph URL so
            // the first detail-screen open doesn't visibly download the
            // SVG. Small (1031 × ~3 KB SVG) and one-shot per catalog
            // install.
            try {
              const { getAllSetIconUris } = await import('../lib/catalog/catalogDb');
              const uris = getAllSetIconUris();
              if (uris.length > 0) {
                const { Image } = await import('expo-image');
                Image.prefetch(uris, { cachePolicy: 'disk' }).catch(() => {});
              }
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
});
