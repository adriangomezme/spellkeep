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

export function MergeModal({ visible, sourceId, sourceName, sourceType, onClose, onMerged }: Props) {
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

  useEffect(() => {
    if (!visible) setSelectedId(null);
  }, [visible]);

  async function handleMerge() {
    if (!selectedId) return;

    const dest = destinations.find((d) => d.id === selectedId);
    Alert.alert(
      'Confirm Merge',
      `Merge all cards from "${sourceName}" into "${dest?.name}"?\n\n"${sourceName}" will be deleted after merging.`,
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
          <Text style={styles.title}>Merge</Text>

          {/* Source */}
          <Text style={styles.fieldLabel}>Source — Merge from</Text>
          <View style={styles.sourceRow}>
            <Ionicons name={sourceType === 'binder' ? 'albums' : 'list'} size={18} color={colors.textSecondary} />
            <Text style={styles.sourceName}>{sourceName}</Text>
          </View>

          {/* Destination */}
          <Text style={styles.fieldLabel}>Destination — Merging into</Text>
          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : destinations.length === 0 ? (
            <Text style={styles.emptyText}>No other {sourceType}s to merge into</Text>
          ) : (
            <FlatList
              data={destinations}
              keyExtractor={(item) => item.id}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.destRow, selectedId === item.id && styles.destRowSelected]}
                  onPress={() => setSelectedId(item.id)}
                  activeOpacity={0.6}
                >
                  {item.color && <View style={[styles.destColor, { backgroundColor: item.color }]} />}
                  <Text style={styles.destName}>{item.name}</Text>
                  {selectedId === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          )}

          {/* Action */}
          <TouchableOpacity
            style={[styles.mergeButton, (!selectedId || isMerging) && styles.mergeButtonDisabled]}
            onPress={handleMerge}
            disabled={!selectedId || isMerging}
          >
            {isMerging ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.mergeText}>Confirm Merge</Text>
            )}
          </TouchableOpacity>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  sourceName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  loader: {
    paddingVertical: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  list: {
    maxHeight: 200,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  destRowSelected: {
    backgroundColor: colors.primary + '0D',
  },
  destColor: {
    width: 4,
    height: 24,
    borderRadius: 2,
  },
  destName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  mergeButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: 10,
    backgroundColor: colors.primary,
    marginTop: spacing.lg,
  },
  mergeButtonDisabled: {
    opacity: 0.5,
  },
  mergeText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
