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
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Select destination</Text>
            <Text style={styles.subtitle}>
              <Text style={styles.subtitleBold}>{binders.length}</Text> {binders.length === 1 ? 'binder' : 'binders'}
              <Text style={styles.subtitleDot}>  ·  </Text>
              <Text style={styles.subtitleBold}>{lists.length}</Text> {lists.length === 1 ? 'list' : 'lists'}
            </Text>
          </View>
          <View style={styles.headerSlot} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          {binders.length > 0 && <Text style={styles.group}>Binders</Text>}
          {binders.map((d, idx) => (
            <Row
              key={d.id}
              dest={d}
              active={selectedId === d.id}
              isLast={idx === binders.length - 1}
              onPress={() => onSelect(d.id)}
            />
          ))}
          {lists.length > 0 && <Text style={styles.group}>Lists</Text>}
          {lists.map((d, idx) => (
            <Row
              key={d.id}
              dest={d}
              active={selectedId === d.id}
              isLast={idx === lists.length - 1}
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
  isLast,
  onPress,
}: {
  dest: CollectionSummary;
  active: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const tint = dest.color || colors.border;
  const iconColor = dest.color ? 'rgba(255,255,255,0.9)' : colors.textSecondary;
  return (
    <TouchableOpacity
      style={[styles.row, active && styles.rowActive, !isLast && styles.rowDivider]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.thumb, { backgroundColor: tint }]}>
        <Ionicons
          name={DEST_ICONS[dest.type] ?? 'albums'}
          size={16}
          color={iconColor}
        />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, active && styles.rowTitleActive]} numberOfLines={1}>
          {dest.name}
        </Text>
        <Text style={styles.rowSubtitle} numberOfLines={1}>
          <Text style={styles.rowSubtitleBold}>{dest.card_count.toLocaleString('en-US')}</Text> cards
          <Text style={styles.subtitleDot}>  ·  </Text>
          <Text style={styles.rowSubtitleBold}>{dest.unique_cards.toLocaleString('en-US')}</Text> unique
        </Text>
      </View>
      {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
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
  headerSlot: {
    width: 60,
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
    minWidth: 60,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '500',
  },
  subtitleBold: {
    color: colors.text,
    fontWeight: '700',
  },
  subtitleDot: {
    color: colors.textMuted,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
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
    gap: spacing.sm + 4,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowActive: {
    backgroundColor: colors.primary + '0F',
  },
  thumb: {
    width: 30,
    height: 30,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  rowTitleActive: {
    color: colors.primary,
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '500',
  },
  rowSubtitleBold: {
    color: colors.textSecondary,
    fontWeight: '700',
  },
});
