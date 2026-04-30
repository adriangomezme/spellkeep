import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ParsedClause } from '../../lib/search/queryParser';
import { colors, spacing, fontSize } from '../../constants';

type Props = {
  clauses: ParsedClause[];
  onRemove: (clause: ParsedClause) => void;
};

/**
 * Visual readout of recognized Scryfall-syntax clauses parsed live
 * from the search input. The chips wrap onto multiple lines when
 * needed — a horizontal ScrollView stretches vertically inside the
 * flex parent and turns the row into giant pills, so we use a
 * plain row+wrap view instead.
 *
 * Each chip is sized to content (no flex), tap-X removes that clause
 * from the underlying query string.
 */
function SyntaxChipsInner({ clauses, onRemove }: Props) {
  if (clauses.length === 0) return null;
  return (
    <View style={styles.row}>
      {clauses.map((c) => (
        <View key={`${c.start}-${c.raw}`} style={styles.chip}>
          <Ionicons name={c.icon} size={14} color={colors.primary} />
          <Text style={styles.label} numberOfLines={1}>{c.label}</Text>
          <TouchableOpacity
            onPress={() => onRemove(c)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

export const SyntaxChips = memo(SyntaxChipsInner);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.sm + 2,
    // Chip-to-chip + row-to-row gap. Earlier 4 / 6 read as "stuck
    // together" — 8 gives every chip a clear gutter to its neighbour
    // and to the next wrapped row.
    gap: 8,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    // Internal rhythm: 8 px between icon → label → close glyph so
    // the close target doesn't feel glued to the label.
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    maxWidth: 240,
  },
  label: {
    color: colors.primary,
    // sm (13) is the body-text size used by the design system's
    // pill components (PrimaryCTA, segmented controls). Keeps the
    // chips legible without dominating the row.
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
