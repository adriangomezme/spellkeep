import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize } from '../../constants';

const MOCK = {
  collectionValue: 136344.44,
  collectionChange24h: 1.42,
  topMover: { name: 'Ugin, the Spirit Dragon', value: 1350, changePct: 12.5 },
  biggestHolding: { name: 'Vorinclex', value: 1237.5, changePct: 12.5 },
};

function ChangeBadge({ value, suffix }: { value: number; suffix?: string }) {
  const isPositive = value >= 0;
  const tint = isPositive ? colors.success : colors.error;
  const compact = !suffix;
  return (
    <View style={s.changeRow}>
      <Ionicons
        name={isPositive ? 'arrow-up' : 'arrow-down'}
        size={compact ? 9 : 11}
        color={tint}
      />
      <Text style={[compact ? s.changeValSm : s.changeVal, { color: tint }]}>
        {Math.abs(value).toFixed(1)}%
        {suffix ? <Text style={s.changeSuffix}> {suffix}</Text> : null}
      </Text>
    </View>
  );
}

function formatMoney(v: number) {
  return Math.round(v).toLocaleString('en-US');
}

export function MarketHeaderCompact() {
  const d = MOCK;

  return (
    <View style={s.row}>
      <View style={[s.cell, s.divider]}>
        <Text style={s.label}>Total Value</Text>
        <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          ${formatMoney(d.collectionValue)}
        </Text>
        <View style={s.valueChange}>
          <ChangeBadge value={d.collectionChange24h} suffix="today" />
        </View>
      </View>

      <View style={[s.cell, s.divider]}>
        <Text style={s.label}>Top Card</Text>
        <Text style={s.cardName} numberOfLines={1}>{d.biggestHolding.name}</Text>
        <View style={s.subRow}>
          <Text style={s.subval}>${formatMoney(d.biggestHolding.value)}</Text>
          <ChangeBadge value={d.biggestHolding.changePct} />
        </View>
      </View>

      <View style={s.cell}>
        <Text style={s.label}>Top Mover</Text>
        <Text style={s.cardName} numberOfLines={1}>{d.topMover.name}</Text>
        <View style={s.subRow}>
          <Text style={s.subval}>${formatMoney(d.topMover.value)}</Text>
          <ChangeBadge value={d.topMover.changePct} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 2,
    alignItems: 'flex-start',
  },
  divider: {
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  label: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  value: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  cardName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  subval: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  valueChange: {
    marginTop: 4,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  changeVal: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  changeValSm: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  changeSuffix: {
    fontWeight: '500',
  },
});
