import { memo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { MTGGlyph } from '../MTGGlyph';
import type { Group } from '../../lib/cardListUtils';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

// Pastel "gem" backgrounds used as the bubble fill behind each mana
// glyph — same palette as the FilterSheet color chips so the visual
// language stays consistent across the app.
const COLOR_BUBBLE_BG: Record<string, string> = {
  W: '#FFFBD5',
  U: '#AAE0FA',
  B: '#CBC2BF',
  R: '#F9AA8F',
  G: '#9BD3AE',
  colorless: '#E8E4E0',
  multi: '#F0E68C',
};
const COLOR_BUBBLE_FG = '#1A1718';

// Light "ribbon" header: surface elevated above the page bg so it
// reads as a divider between groups, not as a chrome bar. A 1 px
// hairline underneath sets it apart from the cards below; a top
// hairline keeps the seam clean when sticky-scrolling. Icons keep
// their natural ink so rarity gems / set glyphs don't get washed out.
const HEADER_BG = colors.surface;
const HEADER_BORDER = colors.border;
const HEADER_FG = colors.text;
const HEADER_FG_MUTED = colors.textSecondary;

type Props = {
  group: Group<unknown>;
  isCollapsed: boolean;
  onToggle: (key: string) => void;
};

function GroupHeaderImpl({ group, isCollapsed, onToggle }: Props) {
  const handlePress = useCallback(() => onToggle(group.key), [group.key, onToggle]);

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={handlePress}
      activeOpacity={0.6}
    >
      <View style={styles.iconWrap}>
        <GroupHeaderIcon group={group} />
      </View>

      <View style={styles.text}>
        <Text style={styles.label} numberOfLines={1}>{group.label}</Text>
        <Text style={styles.sub} numberOfLines={1}>
          {formatSubtitle(group)}
        </Text>
      </View>

      <Ionicons
        name="chevron-down"
        size={16}
        color={HEADER_FG_MUTED}
        style={[styles.chevron, isCollapsed && styles.chevronCollapsed]}
      />
    </TouchableOpacity>
  );
}

export const GroupHeader = memo(GroupHeaderImpl);

function formatSubtitle(group: Group<unknown>): string {
  const parts: string[] = [];
  parts.push(`${group.cardCount.toLocaleString()} ${group.cardCount === 1 ? 'card' : 'cards'}`);
  if (group.subtotal != null && group.subtotal > 0) {
    parts.push(
      `$${group.subtotal.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    );
  }
  if (group.sublabel) parts.push(group.sublabel);
  return parts.join(' · ');
}

function GroupHeaderIcon({ group }: { group: Group<unknown> }) {
  const icon = group.icon;
  switch (icon.kind) {
    case 'rarity':
      return <MTGGlyph kind="rarity" code={icon.rarity} size={20} />;
    case 'type':
      if (icon.type === 'multicolor') {
        return <Ionicons name="color-palette" size={20} color={HEADER_FG} />;
      }
      return <MTGGlyph kind="type" code={icon.type} size={20} color={HEADER_FG} />;
    case 'set':
      if (icon.svgUri) {
        // Scryfall set SVGs ship as black silhouettes — render as-is on
        // the light header so the brand mark stays recognizable.
        return (
          <ExpoImage
            source={{ uri: icon.svgUri }}
            style={styles.setIcon}
            contentFit="contain"
          />
        );
      }
      return <Ionicons name="albums-outline" size={18} color={HEADER_FG_MUTED} />;
    case 'color': {
      // Pastel bubble matches the FilterSheet color chips: a coloured
      // gem-style background with the dark mana glyph centered on top.
      const bg = COLOR_BUBBLE_BG[icon.color] ?? COLOR_BUBBLE_BG.colorless;
      const glyph =
        icon.color === 'multi' ? (
          <MTGGlyph kind="type" code="multicolor" size={13} color={COLOR_BUBBLE_FG} />
        ) : icon.color === 'colorless' ? (
          <MTGGlyph kind="mana" code="C" size={13} color={COLOR_BUBBLE_FG} />
        ) : (
          <MTGGlyph
            kind="mana"
            code={icon.color as 'W' | 'U' | 'B' | 'R' | 'G'}
            size={13}
            color={COLOR_BUBBLE_FG}
          />
        );
      return <View style={[styles.colorBubble, { backgroundColor: bg }]}>{glyph}</View>;
    }
    case 'tag':
      return (
        <View
          style={[
            styles.colorDot,
            { backgroundColor: icon.color ?? colors.textMuted },
          ]}
        />
      );
    case 'none':
    default:
      return <Ionicons name="ellipse-outline" size={16} color={colors.textMuted} />;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    backgroundColor: HEADER_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: HEADER_BORDER,
  },
  iconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
  label: {
    color: HEADER_FG,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  sub: {
    color: HEADER_FG_MUTED,
    fontSize: fontSize.xs,
    marginTop: 1,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  chevron: {
    transform: [{ rotate: '0deg' }],
  },
  chevronCollapsed: {
    transform: [{ rotate: '-90deg' }],
  },
  setIcon: {
    width: 22,
    height: 22,
  },
  colorBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: borderRadius.full,
  },
});
