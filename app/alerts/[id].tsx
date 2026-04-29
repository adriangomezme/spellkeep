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

const DIR_UP = colors.success;
const DIR_DOWN = colors.error;
const PAUSE_COLOR = colors.textSecondary;
const SNOOZE_COLOR = '#6B8AFF';

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
        `Active again at ${formatDateTime(alert.snoozed_until!)}.`,
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
          <Text style={styles.headerTitle}>Alert details</Text>
          <View style={{ width: 28 }} />
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

  const triggerCount = events?.length ?? 0;
  const originalSnapshot =
    triggerCount > 0
      ? events![triggerCount - 1].snapshot_price ?? alert.snapshot_price
      : alert.snapshot_price;
  const snapshotMoved =
    triggerCount > 0 && Math.abs(originalSnapshot - alert.snapshot_price) > 0.001;

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
          <Ionicons name="ellipsis-horizontal-circle-outline" size={26} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — identity + condition + status chips */}
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
            <View style={styles.heroChipRow}>
              <View style={[styles.chip, { backgroundColor: dirColor + '1F' }]}>
                <Ionicons name={dirIcon} size={12} color={dirColor} />
                <Text style={[styles.chipText, { color: dirColor }]}>{conditionLabel}</Text>
              </View>
              {triggerCount > 0 && (
                <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="flash" size={12} color={colors.primary} />
                  <Text style={[styles.chipText, { color: colors.primary }]}>
                    {triggerCount === 1 ? 'Triggered' : `Triggered ${triggerCount}×`}
                  </Text>
                </View>
              )}
              {alert.status === 'paused' && (
                <View style={[styles.chip, { backgroundColor: PAUSE_COLOR + '1F' }]}>
                  <Ionicons name="pause" size={12} color={PAUSE_COLOR} />
                  <Text style={[styles.chipText, { color: PAUSE_COLOR }]}>Paused</Text>
                </View>
              )}
              {snoozed && (
                <View style={[styles.chip, { backgroundColor: SNOOZE_COLOR + '1F' }]}>
                  <Ionicons name="moon-outline" size={12} color={SNOOZE_COLOR} />
                  <Text style={[styles.chipText, { color: SNOOZE_COLOR }]}>
                    Snoozed · {formatDateShort(alert.snoozed_until!)}
                  </Text>
                </View>
              )}
              {!!alert.auto_rearm && (
                <View style={[styles.chip, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name="refresh" size={12} color={colors.primary} />
                  <Text style={[styles.chipText, { color: colors.primary }]}>Auto re-arm</Text>
                </View>
              )}
            </View>
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
              <Ionicons name="refresh-circle" size={26} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reactivateTitle}>Alert already triggered</Text>
              <Text style={styles.reactivateBody}>
                Fired {alert.triggered_at ? formatDateTime(alert.triggered_at) : ''}
                {'. '}Tap to re-activate it — snapshot resets to the current price.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        )}

        {/* Price grid */}
        <View style={styles.priceCard}>
          <PriceCell
            label="Current"
            value={hasCurrent ? formatUSD(currentPrice!) : '—'}
            subtitle={
              hasCurrent
                ? `${deltaUp ? '+' : ''}${deltaPct.toFixed(2)}% from snapshot`
                : 'no market data'
            }
            subtitleColor={hasCurrent ? (deltaUp ? DIR_UP : DIR_DOWN) : colors.textMuted}
            emphasized
          />
          <View style={styles.priceDivider} />
          <PriceCell
            label="Snapshot"
            value={formatUSD(alert.snapshot_price)}
            subtitle={snapshotMoved ? 'after auto re-arm' : 'when alert was created'}
          />
          <View style={styles.priceDivider} />
          <PriceCell
            label="Target"
            value={formatUSD(target)}
            subtitle={
              alert.direction === 'below' ? 'fires at or below' : 'fires at or above'
            }
            subtitleColor={dirColor}
          />
        </View>

        {/* History */}
        <Text style={styles.sectionLabel}>
          History · {triggerCount} {triggerCount === 1 ? 'trigger' : 'triggers'}
        </Text>

        <View style={styles.timelineCard}>
          {/* Latest snapshot — only if it has moved from the original */}
          {snapshotMoved && (
            <TimelineRow
              isFirst
              marker={
                <View style={[styles.timelineDot, { backgroundColor: colors.primary + '1F' }]}>
                  <View style={[styles.timelineDotCore, { backgroundColor: colors.primary }]} />
                </View>
              }
              label="Latest snapshot"
              date={formatDateTime(alert.updated_at)}
              relative={formatRelative(alert.updated_at)}
              valueNode={
                <Text style={styles.timelineValue}>{formatUSD(alert.snapshot_price)}</Text>
              }
              caption={`Re-armed after the last trigger · target ${formatUSD(target)}`}
            />
          )}

          {/* Trigger events (newest first) */}
          {events?.map((e, idx) => {
            const dir = e.direction;
            const eDirColor = dir === 'above' ? DIR_UP : DIR_DOWN;
            const verb = dir === 'above' ? 'Rose to' : 'Dropped to';
            const snap = e.snapshot_price ?? 0;
            const eDelta = snap > 0 ? ((e.current_price - snap) / snap) * 100 : 0;
            const isFirst = !snapshotMoved && idx === 0;

            return (
              <TimelineRow
                key={e.id}
                isFirst={isFirst}
                marker={
                  <View style={[styles.timelineDot, { backgroundColor: eDirColor + '1F' }]}>
                    <Ionicons name="flash" size={11} color={eDirColor} />
                  </View>
                }
                label="Triggered"
                date={formatDateTime(e.at)}
                relative={formatRelative(e.at)}
                valueNode={
                  <Text style={styles.timelineValue}>
                    <Text style={styles.timelineVerb}>{verb} </Text>
                    <Text style={{ color: eDirColor }}>{formatUSD(e.current_price)}</Text>
                  </Text>
                }
                caption={`${eDelta >= 0 ? '+' : ''}${eDelta.toFixed(2)}% from $${snap.toFixed(2)} · target ${formatUSD(e.target_price)}`}
              />
            );
          })}

          {/* Original snapshot — always anchored at the bottom */}
          <TimelineRow
            isLast
            isFirst={triggerCount === 0 && !snapshotMoved}
            marker={
              <View style={[styles.timelineDot, { backgroundColor: colors.surfaceSecondary }]}>
                <Ionicons
                  name={triggerCount > 0 ? 'flag-outline' : 'time-outline'}
                  size={11}
                  color={colors.textSecondary}
                />
              </View>
            }
            label={triggerCount > 0 ? 'Original snapshot' : 'Snapshot'}
            date={formatDateTime(alert.created_at)}
            relative={formatRelative(alert.created_at)}
            valueNode={<Text style={styles.timelineValue}>{formatUSD(originalSnapshot)}</Text>}
            caption={
              triggerCount > 0
                ? 'Initial anchor when the alert was created.'
                : `Watching for ${conditionLabel} · target ${formatUSD(target)}.`
            }
            footer={
              triggerCount === 0 ? (
                <Text style={styles.timelineEmptyHint}>
                  When this alert fires, each event lands here.
                </Text>
              ) : undefined
            }
          />
        </View>
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
      <Text style={styles.priceCellLabel}>{label.toUpperCase()}</Text>
      <Text
        style={[
          styles.priceCellValue,
          emphasized && styles.priceCellValueEmphasized,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
      {subtitle && (
        <Text
          style={[
            styles.priceCellSubtitle,
            subtitleColor ? { color: subtitleColor } : null,
          ]}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      )}
    </View>
  );
}

function TimelineRow({
  marker,
  label,
  date,
  relative,
  valueNode,
  caption,
  footer,
  isFirst,
  isLast,
}: {
  marker: React.ReactNode;
  label: string;
  date: string;
  relative?: string;
  valueNode: React.ReactNode;
  caption?: string;
  footer?: React.ReactNode;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineLineUp, isFirst && styles.timelineLineHidden]} />
        {marker}
        <View style={[styles.timelineLineDown, isLast && styles.timelineLineHidden]} />
      </View>
      <View style={[styles.timelineBody, isLast && styles.timelineBodyLast]}>
        <View style={styles.timelineHeader}>
          <Text style={styles.timelineLabel}>{label}</Text>
          {relative && <Text style={styles.timelineRelative}>{relative}</Text>}
        </View>
        {valueNode}
        {caption && <Text style={styles.timelineCaption}>{caption}</Text>}
        <Text style={styles.timelineDate}>{date}</Text>
        {footer}
      </View>
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatRelative(iso: string): string {
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
  if (wks < 4) return `${wks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
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
    letterSpacing: -0.2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },

  // Hero
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  heroImage: {
    width: 64,
    height: 90,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  heroBody: { flex: 1, gap: 4 },
  cardName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    lineHeight: 24,
    letterSpacing: -0.4,
  },
  cardMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  heroChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // Re-activate CTA
  reactivateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  reactivateIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactivateTitle: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  reactivateBody: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 2,
    opacity: 0.85,
  },

  // Section
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    marginBottom: 0,
  },

  // Prices
  priceCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    ...shadows.sm,
  },
  priceCell: {
    flex: 1,
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xs + 2,
  },
  priceDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  priceCellLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  priceCellValue: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.3,
  },
  priceCellValueEmphasized: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  priceCellSubtitle: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.1,
  },

  // Timeline
  timelineCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  timelineRail: {
    alignItems: 'center',
    width: 22,
  },
  timelineLineUp: {
    width: StyleSheet.hairlineWidth * 2,
    height: 6,
    backgroundColor: colors.border,
  },
  timelineLineDown: {
    flex: 1,
    width: StyleSheet.hairlineWidth * 2,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  timelineLineHidden: {
    backgroundColor: 'transparent',
  },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timelineBody: {
    flex: 1,
    paddingBottom: spacing.md + 2,
  },
  timelineBodyLast: {
    paddingBottom: 0,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  timelineLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  timelineRelative: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  timelineValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  timelineVerb: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  timelineCaption: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 4,
    lineHeight: 16,
  },
  timelineDate: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 0.2,
  },
  timelineEmptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    fontStyle: 'italic',
  },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.textSecondary, fontSize: fontSize.md },
});
