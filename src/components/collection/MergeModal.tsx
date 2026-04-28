import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { BottomSheet } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import {
  mergeCollections,
  type CollectionType,
} from '../../lib/collections';
import { PrimaryCTA } from '../PrimaryCTA';

type Destination = {
  id: string;
  name: string;
  type: CollectionType;
  color: string | null;
};

type Props = {
  visible: boolean;
  sourceId: string;
  sourceName: string;
  sourceType: CollectionType;
  onClose: () => void;
  onMerged: () => void;
};

export function MergeModal({
  visible,
  sourceId,
  sourceName,
  sourceType,
  onClose,
  onMerged,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);

  // Local-first: read candidate destinations from PowerSync's SQLite
  // instead of Supabase. Works offline and paints instantly.
  const destRows = useQuery<Destination>(
    `SELECT id, name, type, color
       FROM collections
      WHERE type = ? AND id != ?
      ORDER BY LOWER(name)`,
    [sourceType, sourceId]
  );
  const destinations = (destRows.data ?? []) as Destination[];
  const isLoading = destRows.isLoading;
  const selectedDest = destinations.find((d) => d.id === selectedId);

  useEffect(() => {
    if (!visible) setSelectedId(null);
  }, [visible]);

  async function handleMerge() {
    if (!selectedId) return;

    Alert.alert(
      'Confirm merge',
      `Merge all cards from "${sourceName}" into "${selectedDest?.name}"?\n\n"${sourceName}" will be deleted after merging.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Merge',
          style: 'destructive',
          onPress: async () => {
            setIsMerging(true);
            try {
              await mergeCollections(sourceId, selectedId);
              onMerged();
            } catch (err) {
              console.error('Merge error:', err);
              Alert.alert('Error', 'Failed to merge collections');
            } finally {
              setIsMerging(false);
            }
          },
        },
      ]
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Merge</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Source */}
      <Text style={styles.fieldLabel}>From</Text>
      <View style={styles.sourceRow}>
        <View style={styles.sourceIconWrap}>
          <Ionicons
            name={sourceType === 'binder' ? 'albums' : 'list'}
            size={18}
            color={colors.textSecondary}
          />
        </View>
        <Text style={styles.sourceName} numberOfLines={1}>{sourceName}</Text>
      </View>

      {/* Destination */}
      <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Into</Text>
      {isLoading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : destinations.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyIcon}>
            <Ionicons
              name={sourceType === 'binder' ? 'albums-outline' : 'list-outline'}
              size={26}
              color={colors.textMuted}
            />
          </View>
          <Text style={styles.emptyTitle}>No other {sourceType}s</Text>
          <Text style={styles.emptyText}>
            Create another {sourceType} to merge this one into.
          </Text>
        </View>
      ) : (
        <FlatList
          data={destinations}
          keyExtractor={(item) => item.id}
          style={styles.list}
          renderItem={({ item, index }) => {
            const tint = item.color || '#A0A8B8';
            const selected = selectedId === item.id;
            const isLast = index === destinations.length - 1;
            return (
              <TouchableOpacity
                style={[styles.destRow, !isLast && styles.destRowDivider]}
                onPress={() => setSelectedId(item.id)}
                activeOpacity={0.6}
              >
                <View style={[styles.destThumb, { backgroundColor: tint }]} />
                <Text style={styles.destName} numberOfLines={1}>{item.name}</Text>
                <View style={[styles.radio, selected && styles.radioActive]}>
                  {selected && <View style={styles.radioDot} />}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      <PrimaryCTA
        variant="solid"
        style={styles.cta}
        label={selectedDest ? `Merge into ${selectedDest.name}` : 'Merge'}
        onPress={handleMerge}
        loading={isMerging}
        disabled={!selectedId || isMerging}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  fieldLabelSpaced: {
    marginTop: spacing.md,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
  },
  sourceIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 5,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  loader: {
    paddingVertical: spacing.xl,
  },
  list: {
    maxHeight: 240,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
  },
  destRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  destThumb: {
    width: 28,
    height: 28,
    borderRadius: 5,
  },
  destName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: {
    borderColor: colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },
  cta: {
    minHeight: 44,
    marginTop: spacing.md,
  },
});
