import { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Destination = {
  id: string;
  name: string;
  type: 'binder' | 'list';
};

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  binder: 'albums',
  list: 'list',
};

type Props = {
  visible: boolean;
  cardCount: number;
  onSelect: (collectionId: string) => void;
  onClose: () => void;
};

export function DestinationPicker({ visible, cardCount, onSelect, onClose }: Props) {
  // Destinations come straight from local PowerSync SQLite — no Supabase
  // round-trip, works offline, appears instantly on open.
  const rows = useQuery<Destination>(
    `SELECT id, name, type
       FROM collections
      ORDER BY CASE type WHEN 'binder' THEN 0 ELSE 1 END,
               LOWER(name)`
  );
  const destinations = useMemo<Destination[]>(() => rows.data ?? [], [rows.data]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <Text style={styles.title}>
            Add {cardCount} card{cardCount !== 1 ? 's' : ''} to...
          </Text>

          <FlatList
            data={destinations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.destinationRow}
                onPress={() => onSelect(item.id)}
                activeOpacity={0.6}
              >
                <Ionicons
                  name={TYPE_ICONS[item.type] ?? 'folder'}
                  size={22}
                  color={colors.primary}
                />
                <View style={styles.destinationInfo}>
                  <Text style={styles.destinationName}>{item.name}</Text>
                  <Text style={styles.destinationType}>{item.type}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No binders or lists yet. Create one first.
              </Text>
            }
          />

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 20,
    maxHeight: '50%',
    ...shadows.lg,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  list: {
    maxHeight: 250,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  destinationType: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  cancelButton: {
    alignItems: 'center',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
});
