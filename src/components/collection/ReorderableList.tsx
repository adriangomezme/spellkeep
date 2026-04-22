import { ReactNode, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ReorderableList, {
  ReorderableListReorderEvent,
  reorderItems,
  useReorderableDrag,
} from 'react-native-reorderable-list';
import { colors, fontSize, spacing } from '../../constants';

// ─────────────────────────────────────────────────────────────────────────
// Reorder UI powered by `react-native-reorderable-list` — it's compatible
// with Reanimated 4, which `react-native-draggable-flatlist` is not.
//
// The list owns its internal order. On Done we hand the final orderedIds
// back to the parent so it can persist them. The parent closes the mode.
// ─────────────────────────────────────────────────────────────────────────

export type ReorderableItem = {
  id: string;
  name: string;
};

type Props<T extends ReorderableItem> = {
  title: string;
  items: T[];
  renderRow: (item: T) => ReactNode;
  onCommit: (orderedIds: string[]) => void;
  onCancel: () => void;
};

// Row has to live in its own component because useReorderableDrag is a
// hook — the library uses it to wire the per-item drag trigger up to
// the list's shared state.
function ReorderRow<T extends ReorderableItem>({
  item,
  renderRow,
}: {
  item: T;
  renderRow: (item: T) => ReactNode;
}) {
  const drag = useReorderableDrag();
  return (
    <Pressable onLongPress={drag} delayLongPress={200} style={styles.rowShell}>
      <View style={styles.dragHandle}>
        <Ionicons name="reorder-three" size={22} color={colors.textMuted} />
      </View>
      <View style={styles.rowBody}>{renderRow(item)}</View>
    </Pressable>
  );
}

export function ReorderableListView<T extends ReorderableItem>({
  title,
  items,
  renderRow,
  onCommit,
  onCancel,
}: Props<T>) {
  // Local copy so drags update immediately without waiting for a parent
  // round-trip; on Done we emit the final id order.
  const [data, setData] = useState<T[]>(items);

  function handleReorder({ from, to }: ReorderableListReorderEvent) {
    setData((prev) => reorderItems(prev, from, to));
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.cancelLabel}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <TouchableOpacity
          onPress={() => onCommit(data.map((item) => item.id))}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.doneLabel}>Done</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>Long-press a row to drag it into place</Text>

      <ReorderableList
        data={data}
        keyExtractor={(item) => item.id}
        onReorder={handleReorder}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <ReorderRow item={item} renderRow={renderRow} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  cancelLabel: { color: colors.textMuted, fontSize: fontSize.md, fontWeight: '500' },
  doneLabel: { color: colors.primary, fontSize: fontSize.md, fontWeight: '700' },
  hint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // Transparent wrapper — the inner row (FolderListItem /
  // CollectionListItem) already paints its own white card with shadow.
  // Stacking another surface here produced the nested-white-card look.
  rowShell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'transparent',
  },
  dragHandle: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
});
