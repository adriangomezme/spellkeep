import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

// ============================================================
// Mock data — will be replaced with real data later
// ============================================================

const MOCK = {
  collectionValue: 2847.35,
  collectionChange24h: 1.42,
  topMover: { name: 'Sheoldred', change: 4.25, changePct: 12.8 },
  biggestHolding: { name: 'The One Ring', value: 68.50 },
  momentum: { score: 72, period: '7d' as const },
};

// ============================================================
// Sub-components
// ============================================================

function ChangeIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const isPositive = value >= 0;
  return (
    <View style={styles.changeRow}>
      <Ionicons
        name={isPositive ? 'caret-up' : 'caret-down'}
        size={10}
        color={isPositive ? colors.success : colors.error}
      />
      <Text style={[styles.changeText, { color: isPositive ? colors.success : colors.error }]}>
        {isPositive ? '+' : ''}{value.toFixed(2)}{suffix}
      </Text>
    </View>
  );
}

function MomentumBar({ score }: { score: number }) {
  // Score 0–100, color gradient from red to green
  const clampedScore = Math.max(0, Math.min(100, score));
  const barColor =
    clampedScore >= 60 ? colors.success :
    clampedScore >= 40 ? colors.warning :
    colors.error;

  return (
    <View style={styles.momentumContainer}>
      <View style={styles.momentumRow}>
        <Text style={styles.momentumScore}>{clampedScore}</Text>
        <Text style={styles.momentumMax}>/100</Text>
      </View>
      <View style={styles.momentumTrack}>
        <View style={[styles.momentumFill, { width: `${clampedScore}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

// ============================================================
// Main component
// ============================================================

export function MarketHeader() {
  const data = MOCK;

  return (
    <View style={styles.card}>
      {/* Row 1 */}
      <View style={styles.row}>
        {/* Collection Value */}
        <View style={[styles.cell, styles.cellBorderRight]}>
          <Text style={styles.cellLabel}>Collection Value</Text>
          <Text style={styles.cellValue}>${data.collectionValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
          <ChangeIndicator value={data.collectionChange24h} />
        </View>

        {/* Top Mover */}
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Top Mover (24h)</Text>
          <Text style={styles.cellCardName} numberOfLines={1}>{data.topMover.name}</Text>
          <ChangeIndicator value={data.topMover.changePct} />
        </View>
      </View>

      {/* Divider */}
      <View style={styles.rowDivider} />

      {/* Row 2 */}
      <View style={styles.row}>
        {/* Biggest Holding */}
        <View style={[styles.cell, styles.cellBorderRight]}>
          <Text style={styles.cellLabel}>Biggest Holding</Text>
          <Text style={styles.cellCardName} numberOfLines={1}>{data.biggestHolding.name}</Text>
          <Text style={styles.cellSubvalue}>${data.biggestHolding.value.toFixed(2)}</Text>
        </View>

        {/* Collection Momentum */}
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>Momentum ({data.momentum.period})</Text>
          <MomentumBar score={data.momentum.score} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
  },
  rowDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.md,
  },
  cell: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  cellBorderRight: {
    borderRightWidth: 1,
    borderRightColor: colors.divider,
  },
  cellLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  cellValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  cellCardName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  cellSubvalue: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  changeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  changeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  momentumContainer: {
    marginTop: 2,
  },
  momentumRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  momentumScore: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  momentumMax: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  momentumTrack: {
    height: 4,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 2,
    overflow: 'hidden',
  },
  momentumFill: {
    height: '100%',
    borderRadius: 2,
  },
});
