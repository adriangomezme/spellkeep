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

const DIR_UP = '#1D9E58';
const DIR_DOWN = '#C24848';

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
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Alerts for this card</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {card.name} · {(card.set ?? '').toUpperCase()} #{card.collector_number}
              </Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{alerts.length}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {alerts.length === 0 ? (
            <Text style={styles.emptyText}>
              No alerts for this card yet.
            </Text>
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

          <TouchableOpacity
            style={[
              styles.cta,
              alerts.length >= MAX_ALERTS_PER_CARD && styles.ctaDisabled,
            ]}
            onPress={() => setCreating(true)}
            disabled={alerts.length >= MAX_ALERTS_PER_CARD}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={18} color="#FFFFFF" />
            <Text style={styles.ctaText}>
              {alerts.length === 0 ? 'Create alert' : 'Add another'}
            </Text>
          </TouchableOpacity>

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
        <View style={styles.conditionLine}>
          <Ionicons
            name={alert.direction === 'above' ? 'trending-up' : 'trending-down'}
            size={14}
            color={dColor}
          />
          <Text style={[styles.conditionText, { color: dColor }]}>{conditionLabel}</Text>
          {alert.mode === 'percent' && (
            <Text style={styles.targetText}>→ {formatUSD(target)}</Text>
          )}
        </View>
        <Text style={styles.finishText}>
          {capitalize(alert.finish)} · from {formatUSD(alert.snapshot_price)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.currentValue}>
          {hasCurrent ? formatUSD(currentPrice!) : '—'}
        </Text>
        {hasCurrent ? (
          <Text style={[styles.deltaText, { color: deltaUp ? DIR_UP : DIR_DOWN }]}>
            {deltaUp ? '+' : ''}{deltaPct.toFixed(1)}%
          </Text>
        ) : (
          <Text style={[styles.deltaText, { color: colors.textMuted }]}>
            no data
          </Text>
        )}
      </View>
      <View style={styles.actionGroup}>
        <TouchableOpacity onPress={onDelete} hitSlop={6} style={styles.actionBtn}>
          <Ionicons name="trash-outline" size={14} color={colors.error} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2 },
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
    fontWeight: '700',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  list: { gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  rowLeft: { flex: 1 },
  conditionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  conditionText: { fontSize: fontSize.md, fontWeight: '700' },
  targetText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
  finishText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  rowRight: { alignItems: 'flex-end' },
  currentValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  deltaText: { fontSize: fontSize.xs, fontWeight: '700', marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: spacing.md + 2,
    marginTop: spacing.xs,
  },
  ctaText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '700' },
  ctaDisabled: { opacity: 0.4 },
  limitText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
