import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { ColorPicker, COLLECTION_COLORS } from './ColorPicker';
import {
  useUserTags,
  type TagWithCount,
  type TagWithMeta,
} from '../../lib/hooks/useUserTags';
import { createOrGetTagLocal } from '../../lib/collections.local';
import { TagEditModal } from './TagEditModal';
import { borderRadius, colors, fontSize, spacing } from '../../constants';

// TagPicker — page-sheet Modal with two tabs:
//   - Add: list every tag visible in this collection, optionally
//     create a new one inline. Done applies via onAddTags(tagIds).
//   - Remove: list only tags currently applied to the selection,
//     with "M of N" counts. Done removes via onRemoveTags(tagIds).
// One entry point in the BulkActionsBar handles both.

type Tab = 'add' | 'remove';

type Props = {
  visible: boolean;
  /** Collection context — enables scoped tags + scope toggle on
   *  Create. */
  collectionId?: string | null;
  /** Cards selected by the bulk UI. Drives applied counts and the
   *  Remove tab content. Empty list disables the Remove tab. */
  selectedCardIds: string[];
  /** Called when the user confirms the Add tab. */
  onAddTags: (tagIds: string[]) => void;
  /** Called when the user confirms the Remove tab. */
  onRemoveTags: (tagIds: string[]) => void;
  onClose: () => void;
};

export function TagPicker({
  visible,
  collectionId = null,
  selectedCardIds,
  onAddTags,
  onRemoveTags,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { tags } = useUserTags(collectionId);

  // ── Applied counts for the Remove tab ─────────────────────────
  // For each tag, how many of the currently-selected cards have it
  // attached. Rendered as "M of N" in the Remove list and used to
  // gate which tags appear there at all.
  const appliedCountsRows = useQuery<{ tag_id: string; applied_count: number }>(
    selectedCardIds.length > 0
      ? `SELECT tag_id, COUNT(DISTINCT collection_card_id) AS applied_count
           FROM collection_card_tags
          WHERE collection_card_id IN (${selectedCardIds.map(() => '?').join(', ')})
          GROUP BY tag_id`
      : `SELECT '' AS tag_id, 0 AS applied_count WHERE 0`,
    selectedCardIds
  );
  const appliedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of appliedCountsRows.data ?? []) {
      m.set(r.tag_id, Number(r.applied_count) || 0);
    }
    return m;
  }, [appliedCountsRows.data]);
  const totalCards = selectedCardIds.length;
  const removableTagsExist = appliedCounts.size > 0;

  // ── Tab state + per-tab pending sets ─────────────────────────
  const [tab, setTab] = useState<Tab>('add');
  const [pendingAdd, setPendingAdd] = useState<Set<string>>(new Set());
  const [pendingRemove, setPendingRemove] = useState<Set<string>>(new Set());

  // ── Create-new state (Add tab only) ──────────────────────────
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string | null>(null);
  const [newScopeLocal, setNewScopeLocal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const newNameRef = useRef<TextInput>(null);

  const [editingTag, setEditingTag] = useState<TagWithMeta | null>(null);

  useEffect(() => {
    if (visible) {
      setPendingAdd(new Set());
      setPendingRemove(new Set());
      setNewName('');
      setNewColor(null);
      setNewScopeLocal(false);
      setTab('add');
    }
  }, [visible]);

  // Keep tab valid: if the user is on Remove and the list becomes
  // empty (e.g. selection changed externally), bounce back to Add.
  useEffect(() => {
    if (tab === 'remove' && !removableTagsExist) setTab('add');
  }, [tab, removableTagsExist]);

  const { globalTags, scopedTags } = useMemo(() => {
    const g: TagWithCount[] = [];
    const s: TagWithCount[] = [];
    for (const t of tags) {
      if (tab === 'remove' && (appliedCounts.get(t.id) ?? 0) === 0) continue;
      if (t.scope_collection_id === null) g.push(t);
      else s.push(t);
    }
    g.sort((a, b) => a.name.localeCompare(b.name));
    s.sort((a, b) => a.name.localeCompare(b.name));
    return { globalTags: g, scopedTags: s };
  }, [tags, tab, appliedCounts]);

  const pending = tab === 'add' ? pendingAdd : pendingRemove;
  const setPending = tab === 'add' ? setPendingAdd : setPendingRemove;

  function toggle(id: string) {
    setPending((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEditFor(tag: TagWithCount) {
    setEditingTag({ ...tag, scope_collection_name: null });
  }

  async function handleCreate() {
    const trimmed = newName.trim();
    if (trimmed.length === 0 || isCreating) return;
    setIsCreating(true);
    try {
      const scope = newScopeLocal && collectionId ? collectionId : null;
      const id = await createOrGetTagLocal(trimmed, newColor, scope);
      setPendingAdd((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setNewName('');
      setNewColor(null);
      requestAnimationFrame(() => newNameRef.current?.focus());
    } catch (err) {
      console.warn('[TagPicker] create failed', err);
    } finally {
      setIsCreating(false);
    }
  }

  function handleConfirm() {
    const ids = Array.from(pending);
    if (ids.length === 0) {
      onClose();
      return;
    }
    if (tab === 'add') {
      onAddTags(ids);
      onClose();
      return;
    }
    // Remove — gentle confirmation since it's destructive on data
    // the user can't trivially restore (the join rows go through
    // PowerSync CRUD).
    const tagNames = ids
      .map((id) => tags.find((t) => t.id === id)?.name ?? '?')
      .map((n) => `"${n}"`)
      .slice(0, 3)
      .join(', ');
    const moreSuffix = ids.length > 3 ? ` and ${ids.length - 3} more` : '';
    Alert.alert(
      ids.length === 1 ? 'Remove tag?' : `Remove ${ids.length} tags?`,
      `${tagNames}${moreSuffix} will be removed from the affected cards.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onRemoveTags(ids);
            onClose();
          },
        },
      ]
    );
  }

  const canChooseScope = !!collectionId;
  const titleLabel = 'Tags';
  const subtitleParts: string[] = [];
  subtitleParts.push(`${pending.size} selected`);
  if (tab === 'add' && tags.length > 0) {
    subtitleParts.push(`${tags.length} total`);
  }
  const subtitleText = subtitleParts.join(' · ');
  const isRemove = tab === 'remove';
  const doneLabelText = isRemove ? 'Remove' : 'Done';

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
            <Text style={styles.title}>{titleLabel}</Text>
            <Text style={styles.subtitle}>{subtitleText}</Text>
          </View>
          <TouchableOpacity
            onPress={handleConfirm}
            hitSlop={10}
            style={[styles.headerBtn, styles.doneBtn]}
            disabled={pending.size === 0}
          >
            <Text
              style={[
                styles.doneLabel,
                isRemove && styles.doneLabelDestructive,
                pending.size === 0 && styles.doneLabelDisabled,
              ]}
            >
              {doneLabelText}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TabButton
            label="Add"
            active={tab === 'add'}
            onPress={() => setTab('add')}
            disabled={false}
          />
          <TabButton
            label="Remove"
            active={tab === 'remove'}
            onPress={() => setTab('remove')}
            disabled={!removableTagsExist}
          />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {tab === 'add' && (
            <>
              <Text style={styles.sectionLabel}>Create new</Text>
              <View style={styles.createRow}>
                <TextInput
                  ref={newNameRef}
                  style={styles.input}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Tag name"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  onSubmitEditing={handleCreate}
                  autoCapitalize="words"
                  blurOnSubmit={false}
                />
                <TouchableOpacity
                  style={[
                    styles.createBtn,
                    (newName.trim().length === 0 || isCreating) && styles.createBtnDisabled,
                  ]}
                  onPress={handleCreate}
                  disabled={newName.trim().length === 0 || isCreating}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.createBtnLabel}>Add</Text>
                </TouchableOpacity>
              </View>

              {canChooseScope && (
                <View style={styles.scopeRow}>
                  <ScopeToggle
                    label="Global"
                    description="Available everywhere"
                    active={!newScopeLocal}
                    onPress={() => setNewScopeLocal(false)}
                  />
                  <ScopeToggle
                    label="Only here"
                    description="Only inside this one"
                    active={newScopeLocal}
                    onPress={() => setNewScopeLocal(true)}
                  />
                </View>
              )}

              <View style={styles.colorRow}>
                <ColorPicker selected={newColor} onSelect={setNewColor} />
              </View>
            </>
          )}

          {canChooseScope && scopedTags.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Only here</Text>
              <View style={styles.listCard}>
                {scopedTags.map((tag, idx) => (
                  <TagListRow
                    key={tag.id}
                    tag={tag}
                    selected={pending.has(tag.id)}
                    appliedCount={isRemove ? appliedCounts.get(tag.id) ?? 0 : null}
                    totalCards={totalCards}
                    isLast={idx === scopedTags.length - 1}
                    onPress={() => toggle(tag.id)}
                    onEditPress={isRemove ? undefined : () => openEditFor(tag)}
                  />
                ))}
              </View>
            </>
          )}

          <Text style={styles.sectionLabel}>
            Global{globalTags.length > 0 ? ` · ${globalTags.length}` : ''}
          </Text>
          {globalTags.length === 0 && scopedTags.length === 0 ? (
            <Text style={styles.emptyText}>
              {isRemove
                ? 'No tags are applied to the selected cards.'
                : 'No tags yet. Create one above to start.'}
            </Text>
          ) : globalTags.length === 0 ? (
            <Text style={styles.emptyText}>
              {isRemove ? 'No global tags applied.' : 'No global tags yet.'}
            </Text>
          ) : (
            <View style={styles.listCard}>
              {globalTags.map((tag, idx) => (
                <TagListRow
                  key={tag.id}
                  tag={tag}
                  selected={pending.has(tag.id)}
                  appliedCount={isRemove ? appliedCounts.get(tag.id) ?? 0 : null}
                  totalCards={totalCards}
                  isLast={idx === globalTags.length - 1}
                  onPress={() => toggle(tag.id)}
                  onEditPress={isRemove ? undefined : () => openEditFor(tag)}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <TagEditModal
          visible={editingTag !== null}
          tag={editingTag}
          onClose={() => setEditingTag(null)}
        />
      </View>
    </Modal>
  );
}

function TabButton({
  label,
  active,
  disabled,
  onPress,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.tabBtn,
        active && styles.tabBtnActive,
        disabled && styles.tabBtnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.tabLabel,
          active && styles.tabLabelActive,
          disabled && styles.tabLabelDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ScopeToggle({
  label,
  description,
  active,
  onPress,
}: {
  label: string;
  description: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.scopeOption, active && styles.scopeOptionActive]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.scopeOptionHead}>
        <Ionicons
          name={active ? 'radio-button-on' : 'radio-button-off'}
          size={16}
          color={active ? colors.primary : colors.textMuted}
        />
        <Text style={[styles.scopeOptionLabel, active && styles.scopeOptionLabelActive]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.scopeOptionDesc} numberOfLines={1}>
        {description}
      </Text>
    </TouchableOpacity>
  );
}

function TagListRow({
  tag,
  selected,
  appliedCount,
  totalCards,
  isLast,
  onPress,
  onEditPress,
}: {
  tag: TagWithCount;
  selected: boolean;
  /** When non-null, render "M of N" — only on the Remove tab. */
  appliedCount: number | null;
  totalCards: number;
  isLast: boolean;
  onPress: () => void;
  onEditPress?: () => void;
}) {
  const dotColor = tag.color ?? COLLECTION_COLORS[5];
  return (
    <View style={[styles.row, !isLast && styles.rowDivider]}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={[styles.rowDot, { backgroundColor: dotColor }]} />
        <Text style={styles.rowName} numberOfLines={1}>{tag.name}</Text>
        {appliedCount !== null ? (
          <Text style={styles.rowCount}>
            {appliedCount} of {totalCards}
          </Text>
        ) : (
          tag.card_count > 0 && (
            <Text style={styles.rowCount}>{tag.card_count}</Text>
          )
        )}
        <View style={styles.rowCheckSlot}>
          {selected && <Ionicons name="checkmark" size={18} color={colors.primary} />}
        </View>
      </TouchableOpacity>
      {onEditPress && (
        <TouchableOpacity
          style={styles.rowEditBtn}
          onPress={onEditPress}
          hitSlop={10}
          activeOpacity={0.6}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  /* Header */
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
    fontWeight: '500',
  },
  doneLabel: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  doneLabelDestructive: {
    color: colors.error,
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
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '500',
  },

  /* Tabs (segmented control) */
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    padding: 4,
    gap: 4,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: 0,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.surface,
  },
  tabBtnDisabled: {
    opacity: 0.4,
  },
  tabLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabLabelDisabled: {
    color: colors.textMuted,
  },

  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
  },

  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },

  /* Create row */
  createRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 42,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    color: colors.text,
    fontSize: fontSize.md,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 42,
    paddingHorizontal: spacing.md + 2,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  createBtnDisabled: {
    opacity: 0.5,
  },
  createBtnLabel: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  /* Scope toggle */
  scopeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  scopeOption: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeOptionActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  scopeOptionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scopeOptionLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    flex: 1,
  },
  scopeOptionLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  scopeOptionDesc: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  colorRow: {
    marginTop: spacing.lg,
  },

  /* Empty */
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingVertical: spacing.md,
  },

  /* Tag list */
  listCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm + 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  rowDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rowCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  rowCheckSlot: {
    width: 22,
    alignItems: 'center',
  },
  rowEditBtn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
});
