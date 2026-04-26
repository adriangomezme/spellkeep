import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { type CollectionSummary } from '../lib/collections';
import { useUserTags, type TagWithCount } from '../lib/hooks/useUserTags';
import { getDefaultTagsForDestination } from '../lib/collections';
import { COLLECTION_COLORS } from './collection/ColorPicker';
import { borderRadius, colors, fontSize, spacing } from '../constants';

// Two-pane page-sheet picker. Top half: pick a destination. Bottom
// half: pick the tags that should be applied alongside the add. The
// tag pane re-scopes whenever the destination changes — globals plus
// the binder's own tags. Per-destination defaults pre-select on open.
//
// Used by AddCardSheet only when the user has the
// `tags-when-adding-cards` toggle enabled in profile/tags.

const DEST_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  binder: 'albums',
  list: 'list',
};

type Props = {
  visible: boolean;
  destinations: CollectionSummary[];
  initialDestinationId: string | null;
  /** Pre-select these tag ids on open. Caller resolves any persisted
   *  default for the initial destination before showing the modal. */
  initialTagIds: string[];
  onConfirm: (selection: { destinationId: string; tagIds: string[] }) => void;
  onClose: () => void;
};

export function DestinationWithTagsPickerModal({
  visible,
  destinations,
  initialDestinationId,
  initialTagIds,
  onConfirm,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const [destinationId, setDestinationId] = useState<string | null>(initialDestinationId);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set(initialTagIds));
  // Track which destination's defaults we last hydrated for, so when
  // the user changes destination we wipe-and-load the new defaults
  // (without clobbering an in-flight manual selection on the same dest).
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);

  // Reset every open. The hydration effect below then loads the
  // initial destination's stored defaults — even when the caller
  // already passed `initialTagIds`, we trust this hook for consistency
  // (caller can always pass [] if they don't want hydration).
  useEffect(() => {
    if (!visible) return;
    setDestinationId(initialDestinationId);
    setSelectedTagIds(new Set(initialTagIds));
    setHydratedFor(initialDestinationId);
  }, [visible, initialDestinationId, initialTagIds]);

  // When the user picks a different destination, replace the current
  // tag selection with that destination's persisted defaults. This is
  // intentionally destructive — defaults-per-destination is the
  // headline behavior; carry-over would defeat it.
  useEffect(() => {
    if (!visible || !destinationId) return;
    if (hydratedFor === destinationId) return;
    let cancelled = false;
    getDefaultTagsForDestination(destinationId)
      .then((ids) => {
        if (cancelled) return;
        setSelectedTagIds(new Set(ids));
        setHydratedFor(destinationId);
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedTagIds(new Set());
          setHydratedFor(destinationId);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [visible, destinationId, hydratedFor]);

  // Alphabetical inside each section — matches DestinationPickerModal
  // and keeps the picker scannable irrespective of hub order.
  const binders = destinations
    .filter((d) => d.type === 'binder')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const lists = destinations
    .filter((d) => d.type === 'list')
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const { tags } = useUserTags(destinationId);
  const { globalTags, scopedTags } = useMemo(() => {
    const g: TagWithCount[] = [];
    const s: TagWithCount[] = [];
    for (const t of tags) {
      if (t.scope_collection_id === null) g.push(t);
      else s.push(t);
    }
    g.sort((a, b) => a.name.localeCompare(b.name));
    s.sort((a, b) => a.name.localeCompare(b.name));
    return { globalTags: g, scopedTags: s };
  }, [tags]);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDone() {
    if (!destinationId) return;
    onConfirm({ destinationId, tagIds: Array.from(selectedTagIds) });
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.headerBtn}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Destination & Tags</Text>
            <Text style={styles.subtitle}>
              {selectedTagIds.size > 0
                ? `${selectedTagIds.size} ${selectedTagIds.size === 1 ? 'tag' : 'tags'} selected`
                : 'Pick a destination and any tags'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDone}
            hitSlop={10}
            style={[styles.headerBtn, styles.doneBtn]}
            disabled={!destinationId}
          >
            <Text style={[styles.doneLabel, !destinationId && styles.doneLabelDisabled]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Top pane — destinations (50%) ── */}
        <View style={styles.pane}>
          <Text style={styles.paneTitle}>Destination</Text>
          <ScrollView
            style={styles.paneScroll}
            contentContainerStyle={styles.paneContent}
            showsVerticalScrollIndicator={false}
          >
            {binders.length > 0 && <Text style={styles.group}>Binders</Text>}
            {binders.map((d) => (
              <DestRow
                key={d.id}
                dest={d}
                active={destinationId === d.id}
                onPress={() => setDestinationId(d.id)}
              />
            ))}
            {lists.length > 0 && <Text style={styles.group}>Lists</Text>}
            {lists.map((d) => (
              <DestRow
                key={d.id}
                dest={d}
                active={destinationId === d.id}
                onPress={() => setDestinationId(d.id)}
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.divider} />

        {/* ── Bottom pane — tags (50%) ── */}
        <View style={styles.pane}>
          <Text style={styles.paneTitle}>Tags</Text>
          <ScrollView
            style={styles.paneScroll}
            contentContainerStyle={[
              styles.paneContent,
              { paddingBottom: insets.bottom + spacing.xl },
            ]}
            showsVerticalScrollIndicator={false}
          >
            {!destinationId ? (
              <Text style={styles.emptyText}>Pick a destination first.</Text>
            ) : globalTags.length === 0 && scopedTags.length === 0 ? (
              <Text style={styles.emptyText}>
                No tags yet for this destination.
              </Text>
            ) : (
              <>
                {scopedTags.length > 0 && (
                  <>
                    <Text style={styles.group}>Only here</Text>
                    <View style={styles.listCard}>
                      {scopedTags.map((tag, idx) => (
                        <TagRow
                          key={tag.id}
                          tag={tag}
                          selected={selectedTagIds.has(tag.id)}
                          isLast={idx === scopedTags.length - 1}
                          onPress={() => toggleTag(tag.id)}
                        />
                      ))}
                    </View>
                  </>
                )}
                {globalTags.length > 0 && (
                  <>
                    <Text style={styles.group}>Global</Text>
                    <View style={styles.listCard}>
                      {globalTags.map((tag, idx) => (
                        <TagRow
                          key={tag.id}
                          tag={tag}
                          selected={selectedTagIds.has(tag.id)}
                          isLast={idx === globalTags.length - 1}
                          onPress={() => toggleTag(tag.id)}
                        />
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function DestRow({
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
      style={[styles.destRow, active && styles.destRowActive]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <Ionicons
        name={DEST_ICONS[dest.type] ?? 'albums'}
        size={20}
        color={dest.color ?? colors.textSecondary}
      />
      <View style={styles.destText}>
        <Text style={styles.destTitle} numberOfLines={1}>{dest.name}</Text>
        <Text style={styles.destSubtitle}>
          {dest.unique_cards} unique · {dest.card_count} total
        </Text>
      </View>
      {active && <Ionicons name="checkmark" size={20} color={colors.primary} />}
    </TouchableOpacity>
  );
}

function TagRow({
  tag,
  selected,
  isLast,
  onPress,
}: {
  tag: TagWithCount;
  selected: boolean;
  isLast: boolean;
  onPress: () => void;
}) {
  const dotColor = tag.color ?? COLLECTION_COLORS[5];
  return (
    <TouchableOpacity
      style={[styles.tagRow, !isLast && styles.tagRowDivider]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.tagDot, { backgroundColor: dotColor }]} />
      <Text style={styles.tagName} numberOfLines={1}>{tag.name}</Text>
      <View style={styles.tagCheckSlot}>
        {selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
      </View>
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
    minWidth: 60,
  },
  doneBtn: {
    alignItems: 'flex-end',
  },
  cancelLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
  },
  doneLabel: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  doneLabelDisabled: {
    opacity: 0.4,
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

  /* ── Two-pane layout — flex 1/1 with a hairline divider ── */
  pane: {
    flex: 1,
    minHeight: 0,
  },
  paneTitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  paneScroll: {
    flex: 1,
  },
  paneContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  /* ── Destination rows ── */
  group: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  destRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: 4,
  },
  destRowActive: {
    backgroundColor: colors.primary + '14',
  },
  destText: {
    flex: 1,
    minWidth: 0,
  },
  destTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  destSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  /* ── Tag rows ── */
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  tagRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  tagDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  tagName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  tagCheckSlot: {
    width: 22,
    alignItems: 'center',
  },

  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingVertical: spacing.md,
  },
});
