import { memo, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SectionList,
  Pressable,
  type TextInput as RNTextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSets, type LocalSetInfo } from '../../lib/hooks/useLocalSets';
import { useSetsParentMap } from '../../lib/hooks/useSetsParentMap';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  onSelectSet: (set: LocalSetInfo) => void;
};

type HierarchyNode = {
  set: LocalSetInfo;
  /** Depth from root, 0 = top-level. Drives indentation + arrow. */
  depth: number;
  /** True for the visually last row of a parent's whole family
   *  (parent + descendants). Drives the inter-family gap so a new
   *  parent always reads as starting a new section. */
  isLastOfFamily: boolean;
};

type Section = { title: string; data: HierarchyNode[] };

function yearOf(released: string | null | undefined): string {
  if (!released) return 'Unknown';
  return released.slice(0, 4);
}

/**
 * Browses every Magic set Scryfall ships, grouped by release year and
 * sub-grouped by parent / child relationships (Strixhaven →
 * Mystical Archive, Tokens, Commander, …). The hierarchy comes from
 * Scryfall's `/sets` endpoint cached locally for a week.
 *
 * Each row shows the set's total card count on the right. Tapping
 * any row hands a `set:CODE` query back to the Search tab.
 */
function SetsBrowserInner({ onSelectSet }: Props) {
  const sets = useLocalSets();
  const parentMap = useSetsParentMap();
  const [search, setSearch] = useState('');
  const inputRef = useRef<RNTextInput | null>(null);

  // Build a tree: roots (no parent in map) get rendered first, then
  // any descendants under each root, in DFS order so the SectionList
  // can stay flat. We compute year sections AFTER flattening so a
  // child set inherits its parent's section even if released years
  // apart (matching Scryfall's grouping intent).
  const sections: Section[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? sets.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q)
        )
      : sets;

    // Children indexed by parent code (lowercased).
    const childrenOf = new Map<string, LocalSetInfo[]>();
    const known = new Set(filtered.map((s) => s.code));
    for (const s of filtered) {
      const parent = parentMap.get(s.code) ?? null;
      // Only treat as child when the parent is also visible in the
      // current filtered list — otherwise an orphan child would never
      // surface during a name search.
      if (parent && known.has(parent)) {
        const bucket = childrenOf.get(parent) ?? [];
        bucket.push(s);
        childrenOf.set(parent, bucket);
      }
    }

    // Roots = sets whose parent is unknown OR not visible. Sorted by
    // released_at desc (newest first).
    const isRoot = (s: LocalSetInfo) => {
      const parent = parentMap.get(s.code) ?? null;
      return !parent || !known.has(parent);
    };
    const roots = filtered
      .filter(isRoot)
      .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));

    // Flatten: for each root, emit it then its descendants (DFS).
    function walk(node: LocalSetInfo, depth: number, out: HierarchyNode[]) {
      out.push({ set: node, depth, isLastOfFamily: false });
      const kids = (childrenOf.get(node.code) ?? []).slice().sort((a, b) =>
        (a.released_at ?? '').localeCompare(b.released_at ?? '')
      );
      for (const k of kids) walk(k, depth + 1, out);
    }

    const byYear = new Map<string, HierarchyNode[]>();
    for (const root of roots) {
      const flat: HierarchyNode[] = [];
      walk(root, 0, flat);
      // Tag the trailing row so the next family below renders with a
      // visible gap (no bg contrast — the gap itself is the divider).
      if (flat.length > 0) flat[flat.length - 1].isLastOfFamily = true;
      const key = yearOf(root.released_at);
      const bucket = byYear.get(key) ?? [];
      bucket.push(...flat);
      byYear.set(key, bucket);
    }

    return Array.from(byYear.entries())
      .sort((a, b) => {
        if (a[0] === 'Unknown') return 1;
        if (b[0] === 'Unknown') return -1;
        return b[0].localeCompare(a[0]);
      })
      .map(([title, data]) => ({ title, data }));
  }, [sets, search, parentMap]);

  const totalShown = sections.reduce((acc, s) => acc + s.data.length, 0);

  return (
    <View style={styles.container}>
      {/* Search bar — sized to match SearchToolbar (small) so the
          field sits in the same place and at the same height as
          the Cards-mode toolbar. No filter / sort / view buttons
          since browsing sets doesn't need them. */}
      <View style={styles.searchBarRow}>
        <Pressable style={styles.searchField} onPress={() => inputRef.current?.focus()}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search sets…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearch('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </Pressable>
      </View>

      {totalShown === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="albums-outline" size={32} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No sets match</Text>
          <Text style={styles.emptyHint}>Try a different name or set code.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.set.code}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.data.length} set{section.data.length === 1 ? '' : 's'}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <SetRow node={item} onPress={() => onSelectSet(item.set)} />
          )}
          stickySectionHeadersEnabled
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

export const SetsBrowser = memo(SetsBrowserInner);

const SetRow = memo(function SetRow({
  node,
  onPress,
}: {
  node: HierarchyNode;
  onPress: () => void;
}) {
  const { set, depth, isLastOfFamily } = node;
  const isChild = depth > 0;
  // Children indent by 16px per level so the hierarchy reads at a
  // glance without burning the whole row width. Roots sit flush
  // against the screen edge.
  const indent = depth * 16;
  return (
    <TouchableOpacity
      style={[styles.row, isLastOfFamily && styles.rowLastOfFamily]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={{ width: indent }} />
      {isChild && (
        <Ionicons
          name="return-down-forward-outline"
          size={12}
          color={colors.textMuted}
          style={{ marginRight: 4 }}
        />
      )}
      <View style={[styles.iconWrap, isChild && styles.iconWrapChild]}>
        {set.icon_svg_uri ? (
          <Image
            source={{ uri: set.icon_svg_uri }}
            style={[styles.icon, isChild && styles.iconChild]}
            contentFit="contain"
            tintColor={colors.primary}
          />
        ) : (
          <Ionicons name="albums-outline" size={16} color={colors.primary} />
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text
            style={[styles.name, isChild && styles.nameChild]}
            numberOfLines={1}
          >
            {set.name}
          </Text>
          <View style={styles.codeChip}>
            <Text style={[styles.code, isChild && styles.codeChild]}>
              {set.code.toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle} numberOfLines={1}>
          {set.released_at ?? '—'}
        </Text>
      </View>
      <Text style={[styles.cardCount, isChild && styles.cardCountChild]}>
        {set.card_count != null ? set.card_count.toLocaleString() : '—'}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  /* Search bar — geometry mirrors SearchToolbar(size='small'): 36 px
     control height, surfaceSecondary pill, screen-edge padding so the
     field aligns horizontally with the Cards toolbar. No action
     buttons because Sets has no sort/filter affordances. */
  searchBarRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  /* Year section header — small uppercase label sitting against the
     screen background, matching the meta attribution pattern from
     the Search hub (`metaAttribution` styling). */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  sectionCount: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  /* Row — white-card hub-row pattern. surface bg, hairline divider,
     no per-row shadow (the visual weight of the icon circle carries
     the row already). 15 px paddingVertical matches FolderListItem
     so heights are consistent across the app. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLastOfFamily: {
    // The next family below renders with a transparent gap that
    // shows the screen background — no per-row divider needed.
    borderBottomWidth: 0,
    marginBottom: spacing.sm,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
  },
  /* Icon circle — tinted primaryLight bg + primary glyph. Same
     pattern used by FolderListItem / Hub iconCircles so the Sets
     browser feels like a sibling surface. */
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapChild: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  icon: {
    width: 22,
    height: 22,
  },
  iconChild: {
    width: 16,
    height: 16,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  nameChild: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  /* Set code rendered as a subtle chip rather than free-floating
     text, matches the editorial "kicker" feel used elsewhere. */
  codeChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 4,
  },
  code: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  codeChild: {
    fontSize: 9,
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  cardCount: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'right',
    letterSpacing: -0.2,
  },
  cardCountChild: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: spacing.md,
    letterSpacing: -0.3,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
});
