import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert as RNAlert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { BottomSheet } from './BottomSheet';
import { CreateAlertSheet } from './CreateAlertSheet';
import {
  colors,
  spacing,
  fontSize,
  borderRadius,
} from '../constants';
import { formatUSD, type ScryfallCard } from '../lib/scryfall';
import {
  computeTargetUsd,
  deleteAlertLocal,
  MAX_ALERTS_PER_CARD,
  type PriceAlert,
} from '../lib/priceAlerts';
import { useAlertPrices, priceKey } from '../lib/hooks/useAlertPrices';
import { PrimaryCTA } from './PrimaryCTA';

const DIR_UP = colors.success;
const DIR_DOWN = colors.error;

type Props = {
  visible: boolean;
  onClose: () => void;
  card: ScryfallCard | null;
};

export function CardAlertsSheet({ visible, onClose, card }: Props) {
  const [editing, setEditing] = useState<PriceAlert | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: rows } = useQuery<PriceAlert>(
    `SELECT id, user_id, card_id, card_name, card_set, card_collector_number,
            card_image_uri, finish, direction, mode, target_value, snapshot_price,
            status, snoozed_until, auto_rearm, created_at, triggered_at, updated_at
       FROM price_alerts
      WHERE card_id = ?
      ORDER BY created_at DESC`,
    [card?.id ?? '']
  );

  const alerts = rows ?? [];
  const priceItems = alerts.map((a) => ({ card_id: a.card_id, finish: a.finish }));
  const priceMap = useAlertPrices(priceItems);

  function confirmDelete(alert: PriceAlert) {
    RNAlert.alert(
      'Delete alert?',
      `Remove this ${alert.direction} alert?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAlertLocal(alert.id),
        },
      ]
    );
  }

  if (!card) return null;

  return (
    <>
      <BottomSheet visible={visible && !editing && !creating} onClose={onClose}>
        <View style={styles.container}>
          {/* Sheet chrome */}
          <View style={styles.chromeRow}>
            <Text style={styles.chromeTitle}>Alerts</Text>
            {alerts.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{alerts.length}</Text>
              </View>
            )}
          </View>

          <Text style={styles.subtitle} numberOfLines={1}>
            {card.name}
            <Text style={styles.subtitleDot}>  ·  </Text>
            <Text style={styles.subtitleSet}>{(card.set ?? '').toUpperCase()} #{card.collector_number}</Text>
          </Text>

          <View style={styles.divider} />

          {alerts.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={26} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No alerts yet</Text>
              <Text style={styles.emptyText}>
                Set a target price or % move and we'll let you know when it triggers.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {alerts.map((a) => (
                <AlertRow
                  key={a.id}
                  alert={a}
                  currentPrice={priceMap.get(priceKey(a.card_id, a.finish)) ?? null}
                  onEdit={() => setEditing(a)}
                  onDelete={() => confirmDelete(a)}
                />
              ))}
            </View>
          )}

          <PrimaryCTA
            variant="solid"
            style={styles.cta}
            label={alerts.length === 0 ? 'Create alert' : 'Add another'}
            onPress={() => setCreating(true)}
            disabled={alerts.length >= MAX_ALERTS_PER_CARD}
          />

          {alerts.length >= MAX_ALERTS_PER_CARD && (
            <Text style={styles.limitText}>
              Limit of {MAX_ALERTS_PER_CARD} alerts per card reached. Delete one to add another.
            </Text>
          )}
        </View>
      </BottomSheet>

      <CreateAlertSheet
        visible={creating}
        onClose={() => setCreating(false)}
        card={card}
      />

      <CreateAlertSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        card={card}
        existing={editing}
      />
    </>
  );
}

function AlertRow({
  alert,
  currentPrice,
  onEdit,
  onDelete,
}: {
  alert: PriceAlert;
  currentPrice: number | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const target = computeTargetUsd(
    alert.snapshot_price,
    alert.mode,
    alert.direction,
    alert.target_value
  );
  const hasCurrent = currentPrice != null;
  const deltaPct =
    hasCurrent && alert.snapshot_price > 0
      ? ((currentPrice! - alert.snapshot_price) / alert.snapshot_price) * 100
      : 0;
  const deltaUp = deltaPct >= 0;
  const dColor = alert.direction === 'above' ? DIR_UP : DIR_DOWN;
  const conditionLabel =
    alert.mode === 'percent'
      ? `${alert.direction === 'below' ? '−' : '+'}${Math.abs(alert.target_value)}%`
      : `${alert.direction === 'below' ? 'Below' : 'Above'} ${formatUSD(alert.target_value)}`;

  return (
    <TouchableOpacity style={styles.row} onPress={onEdit} activeOpacity={0.7}>
      <View style={styles.rowLeft}>
        <Text style={styles.finishLabel}>{capitalize(alert.finish)}</Text>
        <View style={styles.storyLine}>
          <Ionicons
            name={alert.direction === 'above' ? 'trending-up' : 'trending-down'}
            size={13}
            color={dColor}
          />
          <Text style={[styles.conditionText, { color: dColor }]}>{conditionLabel}</Text>
          <Text style={styles.storyMeta}>
            {alert.mode === 'percent' ? ` · target ${formatUSD(target)}` : ''}
            {' · from '}{formatUSD(alert.snapshot_price)}
          </Text>
        </View>
        <Text style={styles.currentLine}>
          <Text style={styles.currentValue}>
            {hasCurrent ? formatUSD(currentPrice!) : '—'}
          </Text>
          {hasCurrent ? (
            <Text style={[styles.deltaInline, { color: deltaUp ? DIR_UP : DIR_DOWN }]}>
              {'  '}({deltaUp ? '+' : ''}{deltaPct.toFixed(2)}%)
            </Text>
          ) : (
            <Text style={styles.deltaInlineMuted}>{'  '}no data</Text>
          )}
        </Text>
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={6} style={styles.actionBtn}>
        <Ionicons name="trash-outline" size={14} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 2 },

  // Sheet chrome
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chromeTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  countBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },

  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  subtitleDot: {
    color: colors.textMuted,
  },
  subtitleSet: {
    color: colors.textMuted,
    fontWeight: '600',
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm + 2,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
  },

  // Alert rows
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowLeft: { flex: 1, minWidth: 0, gap: 2 },
  finishLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  storyLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexWrap: 'wrap',
  },
  conditionText: {
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  storyMeta: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  currentLine: {
    marginTop: 2,
  },
  currentValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  deltaInline: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  deltaInlineMuted: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // CTA
  cta: {
    minHeight: 44,
    marginTop: spacing.xs,
  },
  limitText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    textAlign: 'center',
  },
});
