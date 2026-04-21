import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert as RNAlert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@powersync/react';
import {
  colors,
  spacing,
  fontSize,
  borderRadius,
  shadows,
} from '../../src/constants';
import { formatUSD, getCard, type ScryfallCard } from '../../src/lib/scryfall';
import {
  computeTargetUsd,
  deleteAlertLocal,
  setAlertStatusLocal,
  snoozeAlertLocal,
  updateAlertLocal,
  type PriceAlert,
} from '../../src/lib/priceAlerts';
import { useAlertPrices, priceKey } from '../../src/lib/hooks/useAlertPrices';
import { CreateAlertSheet } from '../../src/components/CreateAlertSheet';

const DIR_UP = '#1D9E58';
const DIR_DOWN = '#C24848';
const PAUSE_COLOR = '#6B7280';
const SNOOZE_COLOR = '#6B8AFF';

type EventRow = {
  id: string;
  current_price: number;
  target_price: number;
  direction: string;
  mode: string;
  at: string;
};

export default function AlertDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [editing, setEditing] = useState<ScryfallCard | null>(null);

  const { data: alertRows } = useQuery<PriceAlert>(
    `SELECT id, user_id, card_id, card_name, card_set, card_collector_number,
            card_image_uri, finish, direction, mode, target_value, snapshot_price,
            status, snoozed_until, auto_rearm, created_at, triggered_at, updated_at
       FROM price_alerts
      WHERE id = ?`,
    [id ?? '']
  );
  const alert = alertRows?.[0] ?? null;

  const { data: events } = useQuery<EventRow>(
    `SELECT id, current_price, target_price, direction, mode, at
       FROM price_alert_events
      WHERE alert_id = ?
      ORDER BY at DESC`,
    [id ?? '']
  );

  const priceItems = useMemo(
    () => (alert ? [{ card_id: alert.card_id, finish: alert.finish }] : []),
    [alert]
  );
  const priceMap = useAlertPrices(priceItems);
  const currentPrice = alert
    ? priceMap.get(priceKey(alert.card_id, alert.finish)) ?? null
    : null;

  function handleDelete() {
    if (!alert) return;
    RNAlert.alert(
      'Delete alert?',
      `Removes this ${alert.direction} alert on ${alert.card_name}. History stays accessible until the alert is deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAlertLocal(alert.id).then(() => router.back());
          },
        },
      ]
    );
  }

  function handleTogglePause() {
    if (!alert) return;
    const next = alert.status === 'paused' ? 'active' : 'paused';
    setAlertStatusLocal(alert.id, next).catch((err: any) =>
      RNAlert.alert('Error', err?.message ?? 'Could not update alert')
    );
  }

  function handleSnooze() {
    if (!alert) return;
    if (alert.status === 'paused') {
      RNAlert.alert(
        'Alert is paused',
        'Resume the alert before snoozing. Snooze is a temporary pause; it only makes sense while the alert is watching.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }
    const snoozed = !!alert.snoozed_until && new Date(alert.snoozed_until) > new Date();
    if (snoozed) {
      RNAlert.alert(
        'Snoozed alert',
        `Active again at ${new Date(alert.snoozed_until!).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })}.`,
        [
          { text: 'Cancel snooze', onPress: () => snoozeAlertLocal(alert.id, 0) },
          { text: 'Close', style: 'cancel' },
        ]
      );
      return;
    }
    RNAlert.alert('Snooze alert', 'Alert pauses and re-activates automatically.', [
      { text: '1 hour', onPress: () => snoozeAlertLocal(alert.id, 1) },
      { text: '24 hours', onPress: () => snoozeAlertLocal(alert.id, 24) },
      { text: '7 days', onPress: () => snoozeAlertLocal(alert.id, 24 * 7) },
      { text: '15 days', onPress: () => snoozeAlertLocal(alert.id, 24 * 15) },
      { text: '30 days', onPress: () => snoozeAlertLocal(alert.id, 24 * 30) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleEdit() {
    if (!alert) return;
    const card = await getCard(alert.card_id).catch(() => null);
    if (card) setEditing(card);
  }

  function handleToggleAutoRearm() {
    if (!alert) return;
    if (alert.mode === 'price' && !alert.auto_rearm) {
      RNAlert.alert(
        'Not available for price alerts',
        'Auto re-arm only applies to percent targets. A fixed-price target would re-fire around the same price.',
        [{ text: 'OK', style: 'cancel' }]
      );
      return;
    }
    updateAlertLocal(alert.id, { autoRearm: !alert.auto_rearm }).catch((err: any) =>
      RNAlert.alert('Error', err?.message ?? 'Could not update alert')
    );
  }

  if (!alert) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Alert not found.</Text>
        </View>
      </View>
    );
  }

  const target = computeTargetUsd(
    alert.snapshot_price,
    alert.mode,
    alert.direction,
    alert.target_value
  );
  const dirColor = alert.direction === 'above' ? DIR_UP : DIR_DOWN;
  const dirIcon = alert.direction === 'above' ? 'trending-up' : 'trending-down';
  const conditionLabel =
    alert.mode === 'percent'
      ? `${alert.direction === 'below' ? '−' : '+'}${Math.abs(alert.target_value)}%`
      : `${alert.direction === 'below' ? 'Below' : 'Above'} ${formatUSD(alert.target_value)}`;
  const snoozed =
    !!alert.snoozed_until && new Date(alert.snoozed_until).getTime() > Date.now();
  const hasCurrent = currentPrice != null;
  const deltaPct =
    hasCurrent && alert.snapshot_price > 0
      ? ((currentPrice! - alert.snapshot_price) / alert.snapshot_price) * 100
      : 0;
  const deltaUp = deltaPct >= 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {alert.card_name}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {alert.card_set.toUpperCase()} · #{alert.card_collector_number} · {capitalize(alert.finish)}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          {alert.card_image_uri && (
            <Image
              source={{ uri: alert.card_image_uri }}
              style={styles.cardThumb}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}
          <View style={styles.cardBody}>
            <View style={styles.conditionLine}>
              <Ionicons name={dirIcon} size={16} color={dirColor} />
              <Text style={[styles.conditionText, { color: dirColor }]}>
                {conditionLabel}
              </Text>
              {alert.mode === 'percent' && (
                <Text style={styles.targetText}>→ {formatUSD(target)}</Text>
              )}
            </View>

            <View style={styles.priceGrid}>
              <View style={styles.priceCell}>
                <Text style={styles.priceCellLabel}>Current</Text>
                <Text style={styles.priceCellValue}>
                  {hasCurrent ? formatUSD(currentPrice!) : '—'}
                </Text>
                {hasCurrent && (
                  <Text
                    style={[
                      styles.priceCellDelta,
                      { color: deltaUp ? DIR_UP : DIR_DOWN },
                    ]}
                  >
                    {deltaUp ? '+' : ''}{deltaPct.toFixed(1)}%
                  </Text>
                )}
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceCellLabel}>Snapshot</Text>
                <Text style={styles.priceCellValue}>{formatUSD(alert.snapshot_price)}</Text>
              </View>
              <View style={styles.priceCell}>
                <Text style={styles.priceCellLabel}>Target</Text>
                <Text style={styles.priceCellValue}>{formatUSD(target)}</Text>
              </View>
            </View>

            <View style={styles.chipRow}>
              {alert.status === 'triggered' && (
                <Chip label="Triggered" color={DIR_DOWN} />
              )}
              {alert.status === 'paused' && (
                <Chip label="Paused" color={PAUSE_COLOR} />
              )}
              {snoozed && (
                <Chip
                  label={`Snoozed until ${formatDate(alert.snoozed_until!)}`}
                  color={SNOOZE_COLOR}
                />
              )}
              {!!alert.auto_rearm && <Chip label="Auto re-arm" color="#1D9E58" icon="refresh" />}
            </View>

            <View style={styles.actionsRow}>
              <ActionBtn label="Edit" icon="create-outline" onPress={handleEdit} />
              <ActionBtn
                label={alert.status === 'paused' ? 'Resume' : 'Pause'}
                icon={alert.status === 'paused' ? 'play' : 'pause'}
                onPress={handleTogglePause}
                color={PAUSE_COLOR}
              />
              <ActionBtn
                label={snoozed ? 'Snoozed' : 'Snooze'}
                icon="moon-outline"
                onPress={handleSnooze}
                color={SNOOZE_COLOR}
                disabled={alert.status === 'paused'}
              />
              <ActionBtn
                label="Delete"
                icon="trash-outline"
                onPress={handleDelete}
                color={colors.error}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.rearmRow,
                alert.mode === 'price' && !alert.auto_rearm && styles.rearmRowDisabled,
              ]}
              onPress={handleToggleAutoRearm}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rearmTitle}>Auto re-arm</Text>
                <Text style={styles.rearmHint}>
                  {alert.mode === 'price' && !alert.auto_rearm
                    ? 'Only available for percent targets.'
                    : alert.auto_rearm
                      ? 'Alert keeps watching after each trigger, re-anchoring the snapshot.'
                      : 'After trigger, re-anchor to the new price and keep watching.'}
                </Text>
              </View>
              <View
                style={[
                  styles.toggle,
                  !!alert.auto_rearm && styles.toggleOn,
                  alert.mode === 'price' && !alert.auto_rearm && styles.toggleDisabled,
                ]}
              >
                <View
                  style={[styles.toggleKnob, !!alert.auto_rearm && styles.toggleKnobOn]}
                />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionLabel}>
          History · {events?.length ?? 0} trigger{(events?.length ?? 0) === 1 ? '' : 's'}
        </Text>
        {(events?.length ?? 0) === 0 ? (
          <View style={styles.historyEmpty}>
            <Ionicons name="time-outline" size={32} color={colors.textMuted} />
            <Text style={styles.historyEmptyText}>
              No triggers yet. When this alert fires, each event lands here.
            </Text>
          </View>
        ) : (
          <View style={styles.timeline}>
            {events!.map((e, idx) => (
              <View key={e.id} style={styles.timelineItem}>
                <View style={styles.timelineDotWrap}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor:
                          e.direction === 'above' ? DIR_UP : DIR_DOWN,
                      },
                    ]}
                  />
                  {idx < events!.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineBody}>
                  <Text style={styles.timelineTitle}>
                    {formatUSD(e.current_price)}
                  </Text>
                  <Text style={styles.timelineMeta}>
                    crossed {formatUSD(e.target_price)} · {formatDate(e.at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <CreateAlertSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        card={editing}
        existing={alert}
      />
    </View>
  );
}

function Chip({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={[styles.chip, { backgroundColor: color + '15' }]}>
      {icon && <Ionicons name={icon} size={11} color={color} />}
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

function ActionBtn({
  label,
  icon,
  onPress,
  color,
  disabled,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}) {
  const tint = disabled ? colors.textMuted : color ?? colors.text;
  return (
    <TouchableOpacity
      style={[styles.actionBtn, disabled && styles.actionBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Ionicons name={icon} size={18} color={tint} />
      <Text style={[styles.actionBtnLabel, { color: tint }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  headerSubtitle: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    flexDirection: 'row',
    gap: spacing.md,
    ...shadows.sm,
  },
  cardThumb: {
    width: 80,
    height: 112,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  cardBody: { flex: 1, gap: spacing.sm },
  conditionLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  conditionText: { fontSize: fontSize.md, fontWeight: '700' },
  targetText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
  priceGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  priceCell: { flex: 1 },
  priceCellLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceCellValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 2 },
  priceCellDelta: { fontSize: fontSize.xs, fontWeight: '700', marginTop: 2 },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  chipText: { fontSize: 10, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnLabel: { fontSize: 10, fontWeight: '600' },
  rearmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rearmRowDisabled: { opacity: 0.5 },
  rearmTitle: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  rearmHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, lineHeight: 16 },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleDisabled: { opacity: 0.5 },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobOn: { transform: [{ translateX: 16 }] },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  timeline: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineDotWrap: { alignItems: 'center', width: 16 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineLine: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  timelineBody: { flex: 1, paddingBottom: spacing.md },
  timelineTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  timelineMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  historyEmpty: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  historyEmptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },
});
