import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  clearImportHistory,
  getImportHistory,
  removeImportHistoryEntry,
  subscribeImportHistory,
  type ImportHistoryEntry,
} from '../../src/lib/importHistory';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

export default function ImportHistoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entries, setEntries] = useState<ImportHistoryEntry[]>([]);

  const load = useCallback(async () => {
    const list = await getImportHistory();
    setEntries(list);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribeImportHistory(setEntries), []);

  function confirmClear() {
    if (entries.length === 0) return;
    Alert.alert(
      'Clear import history?',
      'This only removes the log — your imported cards stay in their binders.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clearImportHistory() },
      ]
    );
  }

  function handleDelete(id: string) {
    Alert.alert(
      'Remove from history?',
      'The imported cards are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeImportHistoryEntry(id) },
      ]
    );
  }

  function openDetail(entry: ImportHistoryEntry) {
    router.push({
      pathname: '/profile/import-history/[id]',
      params: { id: entry.id },
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Import History</Text>
        <TouchableOpacity
          onPress={confirmClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          disabled={entries.length === 0}
        >
          <Text style={[styles.headerAction, entries.length === 0 && styles.headerActionDisabled]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}>
            <Ionicons name="time-outline" size={40} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No imports yet</Text>
          <Text style={styles.emptySubtitle}>
            Imports you run will appear here with their status, destination, and totals.
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <ImportHistoryRow
              entry={item}
              onPress={() => openDetail(item)}
              onLongPress={() => handleDelete(item.id)}
            />
          )}
        />
      )}
    </View>
  );
}

function ImportHistoryRow({
  entry,
  onPress,
  onLongPress,
}: {
  entry: ImportHistoryEntry;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const isFailed = entry.status === 'failed';
  const hasFailures = !isFailed && entry.failedCount > 0;

  const accent = isFailed ? colors.error : hasFailures ? colors.warning : colors.success;
  const bg = isFailed ? colors.errorLight : hasFailures ? colors.warningLight : colors.successLight;
  const icon = isFailed ? 'alert-circle' : hasFailures ? 'checkmark-done' : 'checkmark-circle';

  const saved = entry.imported + entry.updated;
  const duration = Math.max(0, Math.round((entry.finishedAt - entry.startedAt) / 1000));

  return (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.6}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={[styles.iconCircle, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={20} color={accent} />
      </View>
      <View style={styles.rowInfo}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {entry.collectionName}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          {formatFormat(entry.format)} · {formatRelativeTime(entry.finishedAt)} · {duration}s
        </Text>
      </View>
      <View style={styles.rowTrailing}>
        {isFailed ? (
          <Text style={[styles.rowValue, { color: colors.error }]}>Failed</Text>
        ) : (
          <>
            <Text style={styles.rowValue}>{saved.toLocaleString()} saved</Text>
            {entry.failedCount > 0 && (
              <Text style={[styles.rowValueSub, { color: colors.warning }]}>
                {entry.failedCount.toLocaleString()} failed
              </Text>
            )}
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

function formatFormat(f: string): string {
  switch (f) {
    case 'spellkeep': return 'SpellKeep CSV';
    case 'plain': return 'Plain Text';
    case 'csv': return 'CSV';
    case 'hevault': return 'HeVault CSV';
    default: return f;
  }
}

function formatRelativeTime(ms: number): string {
  const diffSec = Math.floor((Date.now() - ms) / 1000);
  if (diffSec < 60) return 'just now';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    textAlign: 'center',
  },
  headerAction: { color: colors.primary, fontSize: fontSize.md, fontWeight: '600' },
  headerActionDisabled: { color: colors.textMuted },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
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
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  rowValueSub: { fontSize: fontSize.xs, fontWeight: '600', marginTop: 2 },

  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '700' },
  emptySubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
