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
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  chip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
    maxWidth: 240,
  },
  label: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
