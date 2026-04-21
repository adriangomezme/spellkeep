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
  reactivateAlertLocal,
  type PriceAlert,
} from '../../src/lib/priceAlerts';
import { useAlertPrices, priceKey } from '../../src/lib/hooks/useAlertPrices';
import { CreateAlertSheet } from '../../src/components/CreateAlertSheet';
import { AlertActionsSheet } from '../../src/components/AlertActionsSheet';

const DIR_UP = '#1D9E58';
const DIR_DOWN = '#C24848';
const PAUSE_COLOR = '#6B7280';
const SNOOZE_COLOR = '#6B8AFF';
const REARM_COLOR = '#1D9E58';

type EventRow = {
  id: string;
  current_price: number;
  target_price: number;
  direction: string;
  mode: string;
  snapshot_price: number | null;
  at: string;
};

export default function AlertDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [editing, setEditing] = useState<ScryfallCard | null>(null);
  const [showActions, setShowActions] = useState(false);

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
    `SELECT id, current_price, target_price, direction, mode, snapshot_price, at
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
      `Removes this ${alert.direction} alert on ${alert.card_name} and its history.`,
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
        `Active again at ${formatDate(alert.snoozed_until!)}.`,
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

  function handleReactivate() {
    if (!alert) return;
    const anchor = currentPrice ?? alert.snapshot_price;
    reactivateAlertLocal(alert.id, anchor).catch((err: any) =>
      RNAlert.alert('Error', err?.message ?? 'Could not re-activate alert')
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
  const isTriggered = alert.status === 'triggered';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alert details</Text>
        <TouchableOpacity
          onPress={() => setShowActions(true)}
          hitSlop={8}
          accessibilityLabel="More actions"
        >
          <Ionicons name="ellipsis-horizontal" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero card — identity + condition + status */}
        <View style={styles.hero}>
          {alert.card_image_uri && (
            <Image
              source={{ uri: alert.card_image_uri }}
              style={styles.heroImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          )}
          <View style={styles.heroBody}>
            <Text style={styles.cardName} numberOfLines={2}>
              {alert.card_name}
            </Text>
            <Text style={styles.cardMeta} numberOfLines={1}>
              {alert.card_set.toUpperCase()} · #{alert.card_collector_number} · {capitalize(alert.finish)}
            </Text>
            <View style={[styles.conditionPill, { backgroundColor: dirColor + '15' }]}>
              <Ionicons name={dirIcon} size={14} color={dirColor} />
              <Text style={[styles.conditionPillText, { color: dirColor }]}>
                {conditionLabel}
              </Text>
            </View>
            {(alert.status === 'paused' || snoozed || !!alert.auto_rearm) && (
              <View style={styles.chipRow}>
                {alert.status === 'paused' && (
                  <Chip label="Paused" color={PAUSE_COLOR} icon="pause" />
                )}
                {snoozed && (
                  <Chip
                    label={`Snoozed until ${formatDate(alert.snoozed_until!)}`}
                    color={SNOOZE_COLOR}
                    icon="moon-outline"
                  />
                )}
                {!!alert.auto_rearm && (
                  <Chip label="Auto re-arm" color={REARM_COLOR} icon="refresh" />
                )}
              </View>
            )}
          </View>
        </View>

        {/* Re-activate CTA for one-shot triggered alerts */}
        {isTriggered && (
          <TouchableOpacity
            style={styles.reactivateCard}
            onPress={handleReactivate}
            activeOpacity={0.85}
          >
            <View style={styles.reactivateIconWrap}>
              <Ionicons name="refresh-circle" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reactivateTitle}>Alert already triggered</Text>
              <Text style={styles.reactivateBody}>
                Fired {alert.triggered_at ? formatDate(alert.triggered_at) : ''}
                {'. '}Tap to re-activate it — snapshot resets to the current price.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Price grid */}
        <Text style={styles.sectionLabel}>Prices</Text>
        <View style={styles.priceCard}>
          <PriceCell
            label="Current"
            value={hasCurrent ? formatUSD(currentPrice!) : '—'}
            subtitle={hasCurrent ? `${deltaUp ? '+' : ''}${deltaPct.toFixed(1)}% from snapshot` : 'no market data'}
            subtitleColor={hasCurrent ? (deltaUp ? DIR_UP : DIR_DOWN) : colors.textMuted}
            emphasized
          />
          <View style={styles.priceDivider} />
          <PriceCell
            label="Snapshot"
            value={formatUSD(alert.snapshot_price)}
          />
          <View style={styles.priceDivider} />
          <PriceCell
            label="Target"
            value={formatUSD(target)}
            subtitleColor={dirColor}
          />
        </View>

        {/* History */}
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
          <View style={styles.historyList}>
            {events!.map((e, idx) => (
              <HistoryEvent
                key={e.id}
                event={e}
                snapshotAtCreate={e.snapshot_price ?? alert.snapshot_price}
                isFirst={idx === 0}
                isLast={idx === events!.length - 1}
              />
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

      <AlertActionsSheet
        visible={showActions}
        onClose={() => setShowActions(false)}
        alert={alert}
        onPause={handleTogglePause}
        onSnooze={handleSnooze}
        onToggleAutoRearm={handleToggleAutoRearm}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </View>
  );
}

function PriceCell({
  label,
  value,
  subtitle,
  subtitleColor,
  emphasized,
}: {
  label: string;
  value: string;
  subtitle?: string;
  subtitleColor?: string;
  emphasized?: boolean;
}) {
  return (
    <View style={styles.priceCell}>
      <Text style={styles.priceCellLabel}>{label}</Text>
      <Text
        style={[
          styles.priceCellValue,
          emphasized && styles.priceCellValueEmphasized,
        ]}
      >
        {value}
      </Text>
      {subtitle && (
        <Text
          style={[
            styles.priceCellSubtitle,
            subtitleColor ? { color: subtitleColor } : null,
          ]}
        >
          {subtitle}
        </Text>
      )}
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


function HistoryEvent({
  event,
  snapshotAtCreate,
  isFirst,
  isLast,
}: {
  event: EventRow;
  snapshotAtCreate: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const dir = event.direction as 'below' | 'above';
  const color = dir === 'above' ? DIR_UP : DIR_DOWN;
  const icon = dir === 'above' ? 'trending-up' : 'trending-down';
  const verb = dir === 'below' ? 'Dropped to' : 'Rose to';
  const delta =
    snapshotAtCreate > 0
      ? ((event.current_price - snapshotAtCreate) / snapshotAtCreate) * 100
      : 0;

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyRailWrap}>
        {!isFirst && <View style={styles.historyRailUp} />}
        <View style={[styles.historyDotOuter, { backgroundColor: color + '25' }]}>
          <Ionicons name={icon} size={14} color={color} />
        </View>
        {!isLast && <View style={styles.historyRailDown} />}
      </View>
      <View style={styles.historyCard}>
        <View style={styles.historyHeaderRow}>
          <Text style={styles.historyWhen}>{formatEventRelative(event.at)}</Text>
          <Text style={styles.historyAbsolute}>{formatDateShort(event.at)}</Text>
        </View>
        <Text style={styles.historyHeadline}>
          <Text style={styles.historyVerb}>{verb} </Text>
          <Text style={[styles.historyPrice, { color }]}>{formatUSD(event.current_price)}</Text>
        </Text>
        <View style={styles.historyMetaRow}>
          <Text style={styles.historyMetaKey}>Target</Text>
          <Text style={styles.historyMetaValue}>{formatUSD(event.target_price)}</Text>
        </View>
        <View style={styles.historyMetaRow}>
          <Text style={styles.historyMetaKey}>From snapshot</Text>
          <Text style={styles.historyMetaValue}>
            {formatUSD(snapshotAtCreate)}
            <Text style={[styles.historyDelta, { color: delta >= 0 ? DIR_UP : DIR_DOWN }]}>
              {'  '}{delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
            </Text>
          </Text>
        </View>
      </View>
    </View>
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

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatEventRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (isNaN(diffMs)) return '';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  return `${wks}w ago`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  heroImage: {
    width: 67,
    height: 94,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  heroBody: { flex: 1, gap: 6 },
  cardName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
    lineHeight: 22,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  conditionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  conditionPillText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  chipText: { fontSize: 10, fontWeight: '700' },
  // Re-activate CTA
  reactivateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  reactivateIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactivateTitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  reactivateBody: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  // Section
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: 2,
  },
  // Prices
  priceCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  priceCell: { flex: 1, alignItems: 'flex-start' },
  priceDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  priceCellLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  priceCellValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: 4,
  },
  priceCellValueEmphasized: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  priceCellSubtitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  // History
  historyList: {},
  historyItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  historyRailWrap: {
    alignItems: 'center',
    width: 32,
  },
  historyRailUp: {
    width: StyleSheet.hairlineWidth * 2,
    height: spacing.sm,
    backgroundColor: colors.border,
  },
  historyRailDown: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  historyDotOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyWhen: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  historyAbsolute: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  historyHeadline: {
    marginTop: 6,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  historyVerb: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  historyPrice: {
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  historyMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  historyMetaKey: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  historyMetaValue: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  historyDelta: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  historyEmpty: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
    ...shadows.sm,
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
