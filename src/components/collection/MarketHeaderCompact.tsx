import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

const MOCK = {
  collectionValue: 2847.35,
  collectionChange24h: 1.42,
  topMover: { name: 'Sheoldred', changePct: 12.8 },
  biggestHolding: { name: 'The One Ring', value: 68.50 },
  momentum: { score: 72 },
};

function MiniChange({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <View style={s.changeRow}>
      <Ionicons
        name={isPositive ? 'caret-up' : 'caret-down'}
        size={8}
        color={isPositive ? colors.success : colors.error}
      />
      <Text style={[s.changeVal, { color: isPositive ? colors.success : colors.error }]}>
        {Math.abs(value).toFixed(1)}%
      </Text>
    </View>
  );
}

export function MarketHeaderCompact() {
  const d = MOCK;
  const mColor =
    d.momentum.score >= 60 ? colors.success :
    d.momentum.score >= 40 ? colors.warning :
    colors.error;

  return (
    <View style={s.card}>
      {/* Collection Value */}
      <View style={[s.cell, s.divider]}>
        <Text style={s.label}>Value</Text>
        <Text style={s.value} numberOfLines={1}>${d.collectionValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
        <MiniChange value={d.collectionChange24h} />
      </View>

      {/* Top Mover */}
      <View style={[s.cell, s.divider]}>
        <Text style={s.label}>Top Mover</Text>
        <Text style={s.cardName} numberOfLines={1}>{d.topMover.name}</Text>
        <MiniChange value={d.topMover.changePct} />
      </View>

      {/* Biggest Holding */}
      <View style={s.cell}>
        <Text style={s.label}>Top Card</Text>
        <Text style={s.cardName} numberOfLines={1}>{d.biggestHolding.name}</Text>
        <Text style={s.subval}>${d.biggestHolding.value.toFixed(0)}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    paddingVertical: spacing.sm + 4,
    ...shadows.sm,
  },
  cell: {
    flex: 1,
    paddingHorizontal: spacing.sm + 2,
    alignItems: 'flex-start',
  },
  divider: {
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  label: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 3,
  },
  value: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '800',
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.xs + 1,
    fontWeight: '700',
  },
  subval: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 1,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    marginTop: 1,
  },
  changeVal: {
    fontSize: 10,
    fontWeight: '600',
  },
  momentumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  momentumNum: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  momentumMax: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '500',
  },
  bar: {
    width: '100%',
    height: 3,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 1.5,
    marginTop: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 1.5,
  },
});
