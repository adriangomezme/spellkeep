import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { type CollectionSummary } from '../lib/collections';
import { colors, spacing, fontSize, borderRadius } from '../constants';

const DEST_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  binder: 'albums',
  list: 'list',
};

type Props = {
  visible: boolean;
  destinations: CollectionSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function DestinationPickerModal({
  visible,
  destinations,
  selectedId,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  // Always alphabetical inside each section so the user can scan
  // by name regardless of underlying sort/order.
  const binders = destinations
    .filter((d) => d.type === 'binder')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const lists = destinations
    .filter((d) => d.type === 'list')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBtn} />
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Select destination</Text>
            <Text style={styles.subtitle}>
              {binders.length} {binders.length === 1 ? 'binder' : 'binders'} · {lists.length} {lists.length === 1 ? 'list' : 'lists'}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={[styles.headerBtn, styles.closeBtn]}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {binders.length > 0 && <Text style={styles.group}>Binders</Text>}
          {binders.map((d) => (
            <Row
              key={d.id}
              dest={d}
              active={selectedId === d.id}
              onPress={() => onSelect(d.id)}
            />
          ))}
          {lists.length > 0 && <Text style={styles.group}>Lists</Text>}
          {lists.map((d) => (
            <Row
              key={d.id}
              dest={d}
              active={selectedId === d.id}
              onPress={() => onSelect(d.id)}
            />
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Row({
  dest,
  active,
  onPress,
}: {
  dest: CollectionSummary;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, active && styles.rowActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Ionicons
        name={DEST_ICONS[dest.type] ?? 'albums'}
        size={22}
        color={dest.color ?? colors.textSecondary}
      />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{dest.name}</Text>
        <Text style={styles.rowSubtitle}>
          {dest.unique_cards} unique · {dest.card_count} total
        </Text>
      </View>
      {active && <Ionicons name="checkmark" size={22} color={colors.primary} />}
    </TouchableOpacity>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtn: {
    width: 40,
  },
  closeBtn: {
    alignItems: 'flex-end',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  group: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: 6,
  },
  rowActive: {
    backgroundColor: colors.primary + '14',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
});
