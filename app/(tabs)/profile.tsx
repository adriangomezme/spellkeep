import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { getAllMeta } from '../../src/lib/catalog/catalogMeta';
import {
  ensureCatalogFresh,
  getCatalogSyncState,
  subscribeCatalogSync,
} from '../../src/lib/catalog/catalogSync';
import type { CatalogSyncState } from '../../src/lib/catalog/types';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

type StorageSnapshot = {
  catalogVersion?: string;
  catalogLastSyncAt?: string;
  imageCacheBytes?: number;
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [storage, setStorage] = useState<StorageSnapshot>({});
  const [catalogState, setCatalogState] = useState<CatalogSyncState>(() => getCatalogSyncState());
  const [refreshing, setRefreshing] = useState(false);

  const loadStorage = useCallback(async () => {
    const [meta, imageCacheBytes] = await Promise.all([
      getAllMeta(),
      measureImageCacheBytes(),
    ]);
    setStorage({
      catalogVersion: meta.snapshot_version,
      catalogLastSyncAt: meta.last_sync_at,
      imageCacheBytes,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStorage();
    }, [loadStorage])
  );

  useEffect(() => subscribeCatalogSync(setCatalogState), []);

  async function onPullRefresh() {
    setRefreshing(true);
    await loadStorage();
    setRefreshing(false);
  }

  async function handleClearImages() {
    Alert.alert(
      'Clear cached images?',
      'Images will re-download as you view them again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await Image.clearDiskCache();
              await Image.clearMemoryCache();
            } catch {}
            await loadStorage();
          },
        },
      ]
    );
  }

  async function handleRefreshCatalog() {
    try {
      await ensureCatalogFresh();
    } catch {}
    await loadStorage();
  }

  const catalogBusy =
    catalogState.status === 'checking' ||
    catalogState.status === 'downloading' ||
    catalogState.status === 'applying';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <Text style={styles.sectionLabel}>Storage</Text>

        {/* Card Database */}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={handleRefreshCatalog}
          disabled={catalogBusy}
        >
          <View style={[styles.iconCircle, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name="library" size={20} color={colors.primary} />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Card Database</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {describeCatalog(storage, catalogState)}
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            {catalogBusy ? (
              <Text style={styles.rowValue}>{formatProgress(catalogState)}</Text>
            ) : (
              <Ionicons name="refresh" size={18} color={colors.textMuted} />
            )}
          </View>
        </TouchableOpacity>

        {/* Cached Images */}
        <TouchableOpacity
          style={styles.row}
          activeOpacity={0.6}
          onPress={handleClearImages}
        >
          <View style={[styles.iconCircle, { backgroundColor: '#F4A8431A' }]}>
            <Ionicons name="images" size={20} color="#F4A843" />
          </View>
          <View style={styles.rowInfo}>
            <Text style={styles.rowTitle}>Cached Images</Text>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              Tap to clear
            </Text>
          </View>
          <View style={styles.rowTrailing}>
            <Text style={styles.rowValue}>
              {formatBytes(storage.imageCacheBytes)}
            </Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Recursively measure a directory. expo-image stores its disk cache inside
 * FileSystem.cacheDirectory — using that as the root is a close-enough
 * proxy that also captures any miscellaneous Expo image processing.
 */
async function measureImageCacheBytes(): Promise<number> {
  const root = FileSystem.cacheDirectory;
  if (!root) return 0;
  try {
    return await dirSize(root);
  } catch {
    return 0;
  }
}

async function dirSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) return 0;
  if (!info.isDirectory) return (info as any).size ?? 0;
  const entries = await FileSystem.readDirectoryAsync(uri);
  let total = 0;
  for (const entry of entries) {
    const child = uri.endsWith('/') ? uri + entry : `${uri}/${entry}`;
    total += await dirSize(child).catch(() => 0);
  }
  return total;
}

function describeCatalog(storage: StorageSnapshot, state: CatalogSyncState): string {
  if (state.status === 'error') return 'Sync error — tap to retry';
  if (state.status === 'checking') return 'Checking for updates…';
  if (state.status === 'downloading') return 'Downloading new version…';
  if (state.status === 'applying') return 'Applying update…';

  if (!storage.catalogVersion) return 'Not yet installed';

  const last = storage.catalogLastSyncAt ? formatRelativeTime(storage.catalogLastSyncAt) : 'never';
  return `v${storage.catalogVersion} · updated ${last}`;
}

function formatProgress(state: CatalogSyncState): string {
  if (state.progress == null) return '…';
  return `${Math.round(state.progress * 100)}%`;
}

function formatBytes(bytes?: number): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (isNaN(then)) return 'unknown';
  const diffMs = Date.now() - then;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxxl, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '600' },
  rowSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
  rowTrailing: { alignItems: 'flex-end' },
  rowValue: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});
