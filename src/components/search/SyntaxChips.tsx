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
          <Ionicons name={c.icon} size={12} color={colors.primary} />
          <Text style={styles.label} numberOfLines={1}>{c.label}</Text>
          <TouchableOpacity
            onPress={() => onRemove(c)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={12} color={colors.primary} />
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
    // Vertical breathing — keeps chips from kissing the search bar
    // above and the result feed below.
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.sm + 2,
    // 8 px gutter between chips (and between wrapped rows) so two
    // adjacent chips read as discrete pills, not one chunk.
    gap: 8,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    // Original compact rhythm restored — bigger pills felt heavy.
    // The breathing wins came from the row-level gaps + paddingTop,
    // not from inflating each chip.
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    maxWidth: 240,
  },
  label: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
