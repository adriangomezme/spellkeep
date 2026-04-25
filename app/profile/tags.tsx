import { useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable, RectButton } from 'react-native-gesture-handler';
import { useAllUserTags, type TagWithMeta } from '../../src/lib/hooks/useUserTags';
import { TagEditModal } from '../../src/components/collection/TagEditModal';
import { ColorPicker, COLLECTION_COLORS } from '../../src/components/collection/ColorPicker';
import {
  createOrGetTagLocal,
  deleteTagLocal,
} from '../../src/lib/collections.local';
import { borderRadius, colors, fontSize, shadows, spacing } from '../../src/constants';

type Section = {
  key: string;
  label: string;
  tags: TagWithMeta[];
};

export default function TagsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tags } = useAllUserTags();
  const [editing, setEditing] = useState<TagWithMeta | null>(null);

  // Create form state — this screen only creates globals; scoped
  // tags are made on the fly from inside a binder/list.
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  // Ref to the create input so we can refocus right after a save —
  // the user is usually adding a few in a row, so keeping the
  // keyboard up + cursor in place avoids a tap per tag.
  const newNameRef = useRef<TextInput>(null);

  async function handleCreate() {
    const trimmed = newName.trim();
    if (trimmed.length === 0 || isCreating) return;
    setIsCreating(true);
    try {
      await createOrGetTagLocal(trimmed, newColor, null);
      setNewName('');
      setNewColor(null);
      // Refocus on the next tick so React commits the cleared state
      // before we ask the input to take focus again.
      requestAnimationFrame(() => newNameRef.current?.focus());
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to create tag');
    } finally {
      setIsCreating(false);
    }
  }

  const sections: Section[] = useMemo(() => {
    const globals = tags.filter((t) => t.scope_collection_id === null);
    const scoped = tags.filter((t) => t.scope_collection_id !== null);

    const byCollection = new Map<string, TagWithMeta[]>();
    for (const t of scoped) {
      const key = t.scope_collection_id ?? '';
      const arr = byCollection.get(key) ?? [];
      arr.push(t);
      byCollection.set(key, arr);
    }

    const out: Section[] = [];
    if (globals.length > 0) {
      out.push({ key: 'global', label: 'Global', tags: globals });
    }
    for (const [, list] of byCollection) {
      const label = list[0].scope_collection_name ?? 'Collection';
      out.push({ key: `scope-${list[0].scope_collection_id}`, label, tags: list });
    }
    return out;
  }, [tags]);

  const canCreate = newName.trim().length > 0 && !isCreating;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tags</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Tags are attached to a copy in a specific binder, list or deck.
          Global tags show up everywhere; collection-specific tags are
          created from inside their own collection.
        </Text>

        {/* ── Create new global ── */}
        <Text style={styles.sectionLabel}>Create new global tag</Text>
        <View style={styles.createCard}>
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
              style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
              onPress={handleCreate}
              disabled={!canCreate}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.createBtnLabel}>Add</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.colorRow}>
            <ColorPicker selected={newColor} onSelect={setNewColor} />
          </View>
        </View>

        {/* ── Existing tags ── */}
        {sections.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Ionicons name="pricetag-outline" size={28} color={colors.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>No tags yet</Text>
            <Text style={styles.emptyText}>
              Create a global tag above, or open a binder and use bulk actions
              to make a collection-specific one.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.label}</Text>
              <View style={styles.sectionCard}>
                {section.tags.map((tag, idx) => (
                  <SwipeableTagRow
                    key={tag.id}
                    tag={tag}
                    isLast={idx === section.tags.length - 1}
                    onPress={() => setEditing(tag)}
                  />
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <TagEditModal
        visible={editing !== null}
        tag={editing}
        onClose={() => setEditing(null)}
      />
    </View>
  );
}

function SwipeableTagRow({
  tag,
  isLast,
  onPress,
}: {
  tag: TagWithMeta;
  isLast: boolean;
  onPress: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);

  function handleDeletePress() {
    swipeRef.current?.close();
    const count = tag.card_count;
    const usage =
      count === 0
        ? "This tag isn't applied to any cards."
        : `This tag is applied to ${count} ${count === 1 ? 'card' : 'cards'}. Deleting it removes it from all of them.`;
    Alert.alert(
      `Delete "${tag.name}"?`,
      `${usage} This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteTagLocal(tag.id).catch((err) =>
              Alert.alert('Error', err?.message ?? 'Failed to delete tag')
            );
          },
        },
      ]
    );
  }

  function renderRightActions() {
    return (
      <RectButton style={styles.swipeAction} onPress={handleDeletePress}>
        <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
        <Text style={styles.swipeActionLabel}>Delete</Text>
      </RectButton>
    );
  }

  const dotColor = tag.color ?? COLLECTION_COLORS[5];
  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      overshootRight={false}
      friction={2}
    >
      <TouchableOpacity
        style={[styles.row, !isLast && styles.rowDivider]}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={[styles.rowDot, { backgroundColor: dotColor }]} />
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>{tag.name}</Text>
          <Text style={styles.rowCount}>
            {tag.card_count} {tag.card_count === 1 ? 'card' : 'cards'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },

  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },

  intro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },

  /* Create */
  createCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...shadows.sm,
  },
  createRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    color: colors.text,
    fontSize: fontSize.md,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnLabel: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  colorRow: { marginTop: spacing.lg },

  /* Sections */
  section: { marginBottom: spacing.md },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs + 2,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    ...shadows.sm,
    overflow: 'hidden',
  },

  /* Row */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  rowDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  rowText: { flex: 1 },
  rowName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  rowCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  /* Swipe action */
  swipeAction: {
    width: 88,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swipeActionLabel: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  /* Empty */
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
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
    marginTop: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
});
