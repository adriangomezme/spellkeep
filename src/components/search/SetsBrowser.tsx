import { memo, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SectionList,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSets, type LocalSetInfo } from '../../lib/hooks/useLocalSets';
import { useSetsParentMap } from '../../lib/hooks/useSetsParentMap';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  onSelectSet: (set: LocalSetInfo) => void;
  /** Search text — owned by the parent (search.tsx) so the search
   *  field can live inside the header card alongside the Cards-mode
   *  toolbar. */
  searchQuery: string;
};

type HierarchyNode = {
  set: LocalSetInfo;
  /** Depth from root, 0 = top-level. Drives indentation + arrow. */
  depth: number;
  /** True for the topmost row of a family (always the depth-0 root).
   *  Drives the rounded top corners so each family reads as a card. */
  isFirstOfFamily: boolean;
  /** True for the visually last row of a parent's whole family
   *  (parent + descendants). Drives the rounded bottom corners and
   *  the inter-family gap so a new parent always reads as starting
   *  a new section. */
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
function SetsBrowserInner({ onSelectSet, searchQuery }: Props) {
  const sets = useLocalSets();
  const parentMap = useSetsParentMap();
  const search = searchQuery;

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
      out.push({
        set: node,
        depth,
        isFirstOfFamily: false,
        isLastOfFamily: false,
      });
      const kids = (childrenOf.get(node.code) ?? []).slice().sort((a, b) =>
        (a.released_at ?? '').localeCompare(b.released_at ?? '')
      );
      for (const k of kids) walk(k, depth + 1, out);
    }

    const byYear = new Map<string, HierarchyNode[]>();
    for (const root of roots) {
      const flat: HierarchyNode[] = [];
      walk(root, 0, flat);
      // Tag the leading + trailing rows so each family reads as a
      // self-contained card with rounded top + bottom corners and a
      // visible gap before the next family below.
      if (flat.length > 0) {
        flat[0].isFirstOfFamily = true;
        flat[flat.length - 1].isLastOfFamily = true;
      }
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
  const { set, depth, isFirstOfFamily, isLastOfFamily } = node;
  const isChild = depth > 0;
  // Tighter indent (12 px per level) keeps the hierarchy visible
  // without burning row width. The arrow glyph is omitted — the
  // indent itself + smaller icon is enough hierarchy signal.
  const indent = depth * 12;
  return (
    <TouchableOpacity
      style={[
        styles.row,
        isFirstOfFamily && styles.rowFirstOfFamily,
        isLastOfFamily && styles.rowLastOfFamily,
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={{ width: indent }} />
      {isChild && (
        <Ionicons
          name="return-down-forward-outline"
          size={12}
          color={colors.textMuted}
          style={styles.hierarchyArrow}
        />
      )}
      <View style={[styles.iconWrap, isChild && styles.iconWrapChild]}>
        {set.icon_svg_uri ? (
          <Image
            source={{ uri: set.icon_svg_uri }}
            style={[styles.icon, isChild && styles.iconChild]}
            contentFit="contain"
            tintColor={colors.text}
          />
        ) : (
          <Ionicons name="albums-outline" size={16} color={colors.text} />
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
  /* Row — white-card hub-row pattern. surface bg, hairline divider
     between siblings inside the same family. Each family wraps as a
     self-contained card: the FIRST row gets a top border + rounded
     top corners, the LAST row gets rounded bottom corners + no
     bottom divider + a marginBottom that creates the inter-family
     gap. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowFirstOfFamily: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
  },
  rowLastOfFamily: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
  },
  /* Hierarchy arrow on child rows — tight 4px gap to its icon
     circle so the inden + arrow + icon trio reads as one unit
     instead of three separate elements floating apart. */
  hierarchyArrow: {
    marginRight: 4,
  },
  /* Icon circle — neutral whisper-gray bg with the set's black SVG
     glyph. The earlier primaryLight (lavender-navy) bg fought with
     black logos; surfaceSecondary keeps the chip readable while
     still giving each icon a circular frame for consistency. */
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
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
