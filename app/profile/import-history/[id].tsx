import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getImportHistory,
  removeImportHistoryEntry,
  subscribeImportHistory,
  type ImportHistoryEntry,
} from '../../../src/lib/importHistory';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../../src/constants';

export default function ImportHistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [entry, setEntry] = useState<ImportHistoryEntry | null>(null);

  const load = useCallback(async () => {
    const all = await getImportHistory();
    setEntry(all.find((e) => e.id === id) ?? null);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribeImportHistory((all) => {
    setEntry(all.find((e) => e.id === id) ?? null);
  }), [id]);

  function handleRemove() {
    if (!entry) return;
    Alert.alert(
      'Remove from history?',
      'The imported cards are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await removeImportHistoryEntry(entry.id);
            router.back();
          },
        },
      ]
    );
  }

  function openBinder() {
    if (!entry) return;
    router.push({
      pathname: '/collection/[id]',
      params: { id: entry.collectionId, name: entry.collectionName },
    });
  }

  if (!entry) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Entry not found.</Text>
        </View>
      </View>
    );
  }

  const isFailed = entry.status === 'failed';
  const hasFailures = !isFailed && entry.failedCount > 0;
  const accent = isFailed ? colors.error : hasFailures ? colors.warning : colors.success;
  const bg = isFailed ? colors.errorLight : hasFailures ? colors.warningLight : colors.successLight;
  const icon = isFailed ? 'alert-circle' : hasFailures ? 'checkmark-done' : 'checkmark-circle';
  const saved = entry.imported + entry.updated;
  const duration = Math.max(0, Math.round((entry.finishedAt - entry.startedAt) / 1000));

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} onRemove={handleRemove} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconBubble, { backgroundColor: bg }]}>
          <Ionicons name={icon as any} size={40} color={accent} />
        </View>
        <Text style={styles.title}>
          {isFailed ? 'Import failed' : 'Import complete'}
        </Text>
        <Text style={styles.subtitle}>{formatFormat(entry.format)}</Text>

        {!isFailed && (
          <View style={styles.stats}>
            <Stat label="Imported" value={entry.imported} />
            <Stat label="Updated" value={entry.updated} />
            <Stat
              label="Failed"
              value={entry.failedCount}
              accent={entry.failedCount > 0 ? colors.warning : undefined}
            />
          </View>
        )}

        {isFailed && entry.errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{entry.errorMessage}</Text>
          </View>
        )}

        <View style={styles.metaCard}>
          <MetaRow label="Destination" value={entry.collectionName} onPress={openBinder} />
          <MetaRow label="Finished" value={new Date(entry.finishedAt).toLocaleString()} />
          <MetaRow label="Duration" value={`${duration}s`} />
          {!isFailed && (
            <MetaRow label="Total saved" value={saved.toLocaleString()} />
          )}
        </View>

        {entry.failedSample.length > 0 && (
          <View style={styles.failedCard}>
            <Text style={styles.failedHeader}>
              Cards we couldn't match {entry.failedCount > entry.failedSample.length
                ? `(${entry.failedSample.length} of ${entry.failedCount})`
                : ''}
            </Text>
            {entry.failedSample.map((name, i) => (
              <Text key={`${name}_${i}`} style={styles.failedItem} numberOfLines={1}>
                {name}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Header({ onBack, onRemove }: { onBack: () => void; onRemove?: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="chevron-back" size={28} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Import Detail</Text>
      {onRemove ? (
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="trash-outline" size={22} color={colors.error} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 22 }} />
      )}
    </View>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value.toLocaleString()}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MetaRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.metaLabel}>{label}</Text>
      <View style={styles.metaValueRow}>
        <Text style={styles.metaValue} numberOfLines={1}>{value}</Text>
        {onPress && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.metaRow} onPress={onPress} activeOpacity={0.6}>
        {content}
      </TouchableOpacity>
    );
  }
  return <View style={styles.metaRow}>{content}</View>;
}

function formatFormat(f: string): string {
  switch (f) {
    case 'spellkeep': return 'SpellKeep CSV';
    case 'plain': return 'Plain Text';
    case 'csv': return 'CSV';
    case 'hevault': return 'Hevault CSV';
    default: return f;
  }
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
  content: { padding: spacing.lg, alignItems: 'center', gap: spacing.md },

  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  title: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.sm },

  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
  statCell: { alignItems: 'center' },
  statValue: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  errorBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.errorLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  errorText: { color: colors.error, fontSize: fontSize.sm },

  metaCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  metaRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  metaLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '600', flex: 1 },

  failedCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  failedHeader: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  failedItem: { color: colors.text, fontSize: fontSize.sm, paddingVertical: 2 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textMuted, fontSize: fontSize.md },
});
