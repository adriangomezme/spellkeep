import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert as RNAlert,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
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
  MAX_ACTIVE_ALERTS_PER_USER,
  type PriceAlert,
  type PriceAlertDirection,
  type PriceAlertMode,
} from '../../src/lib/priceAlerts';
import { CreateAlertSheet } from '../../src/components/CreateAlertSheet';
import { AlertActionsSheet } from '../../src/components/AlertActionsSheet';
import { AlertsSortSheet } from '../../src/components/AlertsSortSheet';
import { useAlertsViewMode } from '../../src/lib/hooks/useAlertsViewMode';
import { useAlertsSortPref, type AlertsSortKey } from '../../src/lib/hooks/useAlertsSortPref';
import { useAlertPrices, priceKey } from '../../src/lib/hooks/useAlertPrices';
import { markTriggeredRead } from '../../src/lib/triggeredReadState';

type TabKey = 'all' | 'paused' | 'triggered';

type TriggerEventRow = {
  event_id: string;
  at: string;
  event_price: number;
  target_price: number;
  event_direction: PriceAlertDirection;
  event_mode: PriceAlertMode;
  alert_id: string;
  card_id: string;
  card_name: string;
  card_set: string;
  card_collector_number: string;
  card_image_uri: string | null;
  finish: PriceAlert['finish'];
  status: PriceAlert['status'];
  auto_rearm: number;
  snoozed_until: string | null;
  snapshot_price: number;
};

const RECENT_EVENT_WINDOW_MS = 24 * 3600 * 1000;

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paused', label: 'Paused' },
  { key: 'triggered', label: 'Triggered' },
];

const DIR_UP = '#1D9E58';
const DIR_DOWN = '#C24848';
const PAUSE_COLOR = '#6B7280'; // neutral slate, replaces the prior gold
const SNOOZE_COLOR = '#6B8AFF';
// Hero / active-tab colors come from the theme so a brand repalette
// propagates here automatically.
const HEADER_BLUE = colors.primary;
const HEADER_BLUE_DARK = colors.primaryDark;

// Pixels of accumulated scroll-delta required to fully collapse the
// search/toolbar block. Higher = slower / more gradual response. The
// accumulator is clamped to [0, threshold] so scrolling-down adds and
// scrolling-up subtracts in real time — the chrome follows the finger
// proportionally, no animation, no spring, no reset-per-frame.
const COLLAPSE_THRESHOLD = 220;

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<TabKey>(
    tabParam === 'paused' || tabParam === 'triggered' ? tabParam : 'all'
  );
  const [search, setSearch] = useState('');
  const { viewMode, setViewMode } = useAlertsViewMode();
  const { sort, setSort } = useAlertsSortPref();
  const [showSort, setShowSort] = useState(false);
  const [editing, setEditing] = useState<{ alert: PriceAlert; card: ScryfallCard | null } | null>(null);
  const [actionsAlert, setActionsAlert] = useState<PriceAlert | null>(null);
  const [collapseHeight, setCollapseHeight] = useState(0);
  const lastY = useSharedValue(0);
  // `accumulator` ∈ [0, COLLAPSE_THRESHOLD]. Tracks the running directional
  // delta of the scroll gesture: each pixel scrolled down adds, each pixel
  // scrolled up subtracts. The visual collapse derives from this accumulator
  // so the chrome follows the finger frame-perfectly in both directions.
  const accumulator = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y;
      const delta = y - lastY.value;
      lastY.value = y;

      // Force fully expanded at (or above) the top — handles rubber-band
      // and ensures the user can always reach a consistent reset state.
      if (y <= 0) {
        accumulator.value = 0;
        return;
      }

      const next = accumulator.value + delta;
      accumulator.value =
        next < 0 ? 0 : next > COLLAPSE_THRESHOLD ? COLLAPSE_THRESHOLD : next;
    },
  });

  // Translate-only animation: the chrome wrapper's *size* never changes —
  // only its on-screen position (transform, GPU thread) and its layout
  // contribution (marginBottom, single Yoga reflow on the parent only).
  // Children (TextInput etc.) keep a constant frame and never re-measure,
  // which is what was producing the "render hitch" the user perceived.
  const collapseStyle = useAnimatedStyle(() => {
    if (collapseHeight === 0) return { opacity: 1 };
    const progress = accumulator.value / COLLAPSE_THRESHOLD;
    return {
      transform: [{ translateY: -collapseHeight * progress }],
      marginBottom: -collapseHeight * progress,
      // Opacity finishes fading well before the translate completes, so the
      // chrome is invisible during the trailing half of its slide-out.
      opacity: interpolate(progress, [0, 0.45, 1], [1, 0, 0], Extrapolation.CLAMP),
    };
  });

  const { data: rows } = useQuery<PriceAlert>(
    `SELECT id, user_id, card_id, card_name, card_set, card_collector_number,
            card_image_uri, finish, direction, mode, target_value, snapshot_price,
            status, snoozed_until, auto_rearm, created_at, triggered_at, updated_at
       FROM price_alerts
      ORDER BY created_at DESC`
  );

  // Trigger-event feed used by the Triggered tab. Joined with the current
  // alert row for card metadata. `snapshot_price` comes from the EVENT
  // (the alert's snapshot at trigger time) so auto-rearmed events still
  // show a meaningful "from snapshot" delta after re-anchoring.
  const { data: eventRows } = useQuery<TriggerEventRow>(
    `SELECT e.id AS event_id,
            e.at,
            e.current_price AS event_price,
            e.target_price,
            e.direction AS event_direction,
            e.mode AS event_mode,
            COALESCE(e.snapshot_price, a.snapshot_price) AS snapshot_price,
            a.id AS alert_id,
            a.card_id,
            a.card_name,
            a.card_set,
            a.card_collector_number,
            a.card_image_uri,
            a.finish,
            a.status,
            a.auto_rearm,
            a.snoozed_until
       FROM price_alert_events e
       JOIN price_alerts a ON a.id = e.alert_id
      ORDER BY e.at DESC`
  );

  // Live prices from catalog.db for every alert currently in memory.
  // Includes alerts across all tabs so the data is warm when the user
  // flips between them.
  const priceItems = useMemo(
    () => (rows ?? []).map((r) => ({ card_id: r.card_id, finish: r.finish })),
    [rows]
  );
  const priceMap = useAlertPrices(priceItems);

  const activeUsageCount = useMemo(
    () => (rows ?? []).filter((a) => a.status === 'active').length,
    [rows]
  );
  const nearLimit =
    activeUsageCount >= Math.floor(MAX_ACTIVE_ALERTS_PER_USER * 0.8);

  // If the route param changes after mount (e.g. a second push arrives
  // while /alerts is already open), respect the new tab.
  useEffect(() => {
    if (tabParam === 'paused' || tabParam === 'triggered' || tabParam === 'all') {
      setTab(tabParam);
    }
  }, [tabParam]);

  // Clear the unread-events badge every time the user lands on Triggered.
  useEffect(() => {
    if (tab === 'triggered') markTriggeredRead();
  }, [tab]);

  const alerts = useMemo(() => {
    const all = rows ?? [];
    // Triggered tab is driven by eventRows (see `events` below) — here
    // we only filter the active/paused inventory views.
    const byTab =
      tab === 'all'
        ? all.filter((a) => a.status !== 'triggered')
        : tab === 'paused'
          ? all.filter((a) => a.status === 'paused')
          : [];
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (a) =>
        a.card_name.toLowerCase().includes(q) ||
        a.card_set.toLowerCase().includes(q) ||
        a.card_collector_number.toLowerCase().includes(q)
    );
  }, [rows, tab, search]);

  const events = useMemo(() => {
    const all = eventRows ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (e) =>
        e.card_name.toLowerCase().includes(q) ||
        e.card_set.toLowerCase().includes(q) ||
        e.card_collector_number.toLowerCase().includes(q)
    );
  }, [eventRows, search]);

  // Trigger counts per alert — used by the "Most triggered" sort key.
  const triggerCountByAlertId = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of eventRows ?? []) {
      m.set(e.alert_id, (m.get(e.alert_id) ?? 0) + 1);
    }
    return m;
  }, [eventRows]);

  // Apply the sort preference on top of the tab/search filter.
  const sortedAlerts = useMemo(() => {
    const arr = [...alerts];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'created':
          cmp =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case 'closest': {
          const aPrice = priceMap.get(priceKey(a.card_id, a.finish));
          const bPrice = priceMap.get(priceKey(b.card_id, b.finish));
          const aTarget = computeTargetUsd(
            a.snapshot_price,
            a.mode,
            a.direction,
            a.target_value
          );
          const bTarget = computeTargetUsd(
            b.snapshot_price,
            b.mode,
            b.direction,
            b.target_value
          );
          const aDist =
            aPrice == null ? Number.POSITIVE_INFINITY : Math.abs(aPrice - aTarget);
          const bDist =
            bPrice == null ? Number.POSITIVE_INFINITY : Math.abs(bPrice - bTarget);
          cmp = aDist - bDist;
          break;
        }
        case 'most_triggered': {
          cmp =
            (triggerCountByAlertId.get(a.id) ?? 0) -
            (triggerCountByAlertId.get(b.id) ?? 0);
          break;
        }
        case 'recently_triggered': {
          const aT = a.triggered_at ? new Date(a.triggered_at).getTime() : 0;
          const bT = b.triggered_at ? new Date(b.triggered_at).getTime() : 0;
          cmp = aT - bT;
          break;
        }
      }
      return sort.ascending ? cmp : -cmp;
    });
    return arr;
  }, [alerts, sort, priceMap, triggerCountByAlertId]);

  // Kicker next to tabs: count of the currently visible tab.
  const tabCount = tab === 'triggered' ? events.length : alerts.length;
  const tabCountLabel =
    tab === 'all'
      ? `${tabCount} total`
      : tab === 'paused'
        ? `${tabCount} paused`
        : `${tabCount} events`;

  // Grouped-by-card: one entry per card_id, with all its alerts under it.
  const grouped = useMemo(() => {
    const byCard = new Map<string, { card: Pick<PriceAlert, 'card_id' | 'card_name' | 'card_set' | 'card_collector_number' | 'card_image_uri' | 'finish'>; alerts: PriceAlert[] }>();
    for (const a of sortedAlerts) {
      const existing = byCard.get(a.card_id);
      if (existing) {
        existing.alerts.push(a);
      } else {
        byCard.set(a.card_id, {
          card: {
            card_id: a.card_id,
            card_name: a.card_name,
            card_set: a.card_set,
            card_collector_number: a.card_collector_number,
            card_image_uri: a.card_image_uri,
            finish: a.finish,
          },
          alerts: [a],
        });
      }
    }
    return Array.from(byCard.values());
  }, [sortedAlerts]);

  async function openEdit(alert: PriceAlert) {
    const card = await getCard(alert.card_id).catch(() => null);
    setEditing({ alert, card });
  }

  function confirmDelete(alert: PriceAlert) {
    RNAlert.alert(
      'Delete alert?',
      `Remove the ${alert.direction} alert on ${alert.card_name}?`,
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

  function togglePause(alert: PriceAlert) {
    const next = alert.status === 'paused' ? 'active' : 'paused';
    setAlertStatusLocal(alert.id, next).catch((err: any) =>
      RNAlert.alert('Error', err?.message ?? 'Could not update alert')
    );
  }

  function toggleAutoRearm(alert: PriceAlert) {
    updateAlertLocal(alert.id, { autoRearm: !alert.auto_rearm }).catch((err: any) =>
      RNAlert.alert('Error', err?.message ?? 'Could not update alert')
    );
  }

  function showSnoozeMenu(alert: PriceAlert) {
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
      RNAlert.alert('Snoozed alert', `Active again at ${formatSnoozeUntil(alert.snoozed_until!)}.`, [
        { text: 'Cancel snooze', onPress: () => snoozeAlertLocal(alert.id, 0) },
        { text: 'Close', style: 'cancel' },
      ]);
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

  const totalAlerts = rows?.length ?? 0;
  const totalTriggers = eventRows?.length ?? 0;

  return (
    <View style={styles.container}>
      {/* Header card — full-bleed white with bottom radius, contains
          title + meta + search + toolbar (tabs + view-mode toggle). */}
      <View style={styles.headerCard}>
        <View style={[styles.headerInner, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/search')}
              hitSlop={8}
              accessibilityLabel="Create new alert"
              style={styles.plusButton}
              activeOpacity={0.85}
            >
              <Ionicons name="add-sharp" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Price Alerts</Text>
          <Text style={styles.metaLine} numberOfLines={1}>
            <Text style={styles.metaBold}>{totalAlerts.toLocaleString('en-US')}</Text>
            <Text style={styles.metaLabel}> {totalAlerts === 1 ? 'alert' : 'alerts'}</Text>
            <Text style={styles.metaDot}>  ·  </Text>
            <Text style={styles.metaBold}>{totalTriggers.toLocaleString('en-US')}</Text>
            <Text style={styles.metaLabel}> {totalTriggers === 1 ? 'trigger' : 'triggers'}</Text>
          </Text>

          <Animated.View
            style={collapseStyle}
            onLayout={(e) => {
              const h = e.nativeEvent.layout.height;
              if (h > 0 && h !== collapseHeight) setCollapseHeight(h);
            }}
          >
              <Text style={styles.description}>
                Get notified when cards hit your target.
              </Text>

              <View style={styles.searchWrap}>
                <Ionicons name="search" size={16} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search by card, set, or number"
                  placeholderTextColor={colors.textMuted}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
                )}
              </View>

              {nearLimit && (
                <View style={styles.limitBanner}>
                  <Ionicons name="warning-outline" size={14} color={colors.warning} />
                  <Text style={styles.limitBannerText}>
                    {activeUsageCount} / {MAX_ACTIVE_ALERTS_PER_USER} active — close to the limit.
                  </Text>
                </View>
              )}

              {/* Toolbar: tabs + sort + view-mode toggle */}
              <View style={styles.toolbarRow}>
                <View style={styles.tabs}>
                  {TABS.map((t) => (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => setTab(t.key)}
                      style={[styles.tab, tab === t.key && styles.tabActive]}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  onPress={() => setShowSort(true)}
                  style={styles.sortBtn}
                  hitSlop={6}
                  accessibilityLabel="Sort alerts"
                >
                  <Ionicons name="swap-vertical" size={16} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.viewModeGroup}>
                  <TouchableOpacity
                    onPress={() => setViewMode('flat')}
                    style={[styles.viewModeBtn, viewMode === 'flat' && styles.viewModeBtnActive]}
                    hitSlop={6}
                    accessibilityLabel="Flat view"
                  >
                    <Ionicons
                      name="list-outline"
                      size={14}
                      color={viewMode === 'flat' ? colors.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewMode('grouped')}
                    style={[styles.viewModeBtn, viewMode === 'grouped' && styles.viewModeBtnActive]}
                    hitSlop={6}
                    accessibilityLabel="Grouped by card"
                  >
                    <Ionicons
                      name="albums-outline"
                      size={14}
                      color={viewMode === 'grouped' ? colors.primary : colors.textMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>
          </Animated.View>
        </View>
      </View>

      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        onScroll={scrollHandler}
      >
        {/* List or empty state */}
        {tab === 'triggered' ? (
          events.length === 0 ? (
            <View style={styles.flexFill}>
              <EmptyState
                tab={tab}
                hasQuery={search.trim().length > 0}
                onFindCard={() => router.push('/(tabs)/search')}
              />
            </View>
          ) : (
            <View style={styles.list}>
              {events.map((e) => (
                <EventRow
                  key={e.event_id}
                  event={e}
                  onPress={() =>
                    router.push({
                      pathname: '/alerts/[id]',
                      params: { id: e.alert_id },
                    })
                  }
                />
              ))}
            </View>
          )
        ) : sortedAlerts.length === 0 ? (
          <View style={styles.flexFill}>
            <EmptyState
              tab={tab}
              hasQuery={search.trim().length > 0}
              onFindCard={() => router.push('/(tabs)/search')}
            />
          </View>
        ) : viewMode === 'flat' ? (
          <View style={styles.list}>
            {sortedAlerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                currentPrice={priceMap.get(priceKey(a.card_id, a.finish)) ?? null}
                triggerCount={triggerCountByAlertId.get(a.id) ?? 0}
                onPress={() =>
                  router.push({ pathname: '/alerts/[id]', params: { id: a.id } })
                }
                onDelete={() => confirmDelete(a)}
                onTogglePause={() => togglePause(a)}
                onSnooze={() => showSnoozeMenu(a)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.list}>
            {grouped.map((g) => (
              <GroupedCard
                key={g.card.card_id}
                card={g.card}
                alerts={g.alerts}
                priceMap={priceMap}
                triggerCounts={triggerCountByAlertId}
                onOpen={() =>
                  router.push({
                    pathname: '/card/[id]',
                    params: { id: g.card.card_id },
                  })
                }
                onTapAlert={(a) =>
                  router.push({ pathname: '/alerts/[id]', params: { id: a.id } })
                }
                onShowActionsAlert={setActionsAlert}
              />
            ))}
          </View>
        )}
      </Animated.ScrollView>

      <CreateAlertSheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        card={editing?.card ?? null}
        existing={editing?.alert ?? null}
      />

      <AlertActionsSheet
        visible={!!actionsAlert}
        onClose={() => setActionsAlert(null)}
        alert={actionsAlert}
        onPause={() => actionsAlert && togglePause(actionsAlert)}
        onSnooze={() => actionsAlert && showSnoozeMenu(actionsAlert)}
        onToggleAutoRearm={() => actionsAlert && toggleAutoRearm(actionsAlert)}
        onEdit={() => actionsAlert && openEdit(actionsAlert)}
        onDelete={() => actionsAlert && confirmDelete(actionsAlert)}
      />

      <AlertsSortSheet
        visible={showSort}
        currentKey={sort.key}
        ascending={sort.ascending}
        onSelect={(key: AlertsSortKey) => {
          setSort({ ...sort, key });
          setShowSort(false);
        }}
        onToggleDirection={() => setSort({ ...sort, ascending: !sort.ascending })}
        onClose={() => setShowSort(false)}
      />
    </View>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function AlertRow({
  alert,
  currentPrice,
  triggerCount,
  onPress,
  onDelete,
  onTogglePause,
  onSnooze,
}: {
  alert: PriceAlert;
  currentPrice: number | null;
  triggerCount: number;
  onPress: () => void;
  onDelete: () => void;
  onTogglePause: () => void;
  onSnooze: () => void;
}) {
  const target = computeTargetUsd(
    alert.snapshot_price,
    alert.mode,
    alert.direction,
    alert.target_value
  );
  const hasCurrent = currentPrice != null;
  const deltaAbs = hasCurrent ? currentPrice! - alert.snapshot_price : 0;
  const deltaPct =
    hasCurrent && alert.snapshot_price > 0
      ? (deltaAbs / alert.snapshot_price) * 100
      : 0;
  const deltaUp = deltaAbs >= 0;

  const dirColor = alert.direction === 'above' ? DIR_UP : DIR_DOWN;
  const dirIcon = alert.direction === 'above' ? 'trending-up' : 'trending-down';
  const conditionLabel =
    alert.mode === 'percent'
      ? `${alert.direction === 'above' ? 'Up' : 'Down'} ${Math.abs(alert.target_value)}%`
      : `${alert.direction === 'above' ? 'Above' : 'Below'} ${formatUSD(alert.target_value)}`;

  // Progress fraction along snapshot → target.
  let fraction = 0;
  if (hasCurrent) {
    const total = Math.abs(target - alert.snapshot_price);
    if (total > 0) {
      const progressed =
        alert.direction === 'above'
          ? currentPrice! - alert.snapshot_price
          : alert.snapshot_price - currentPrice!;
      fraction = Math.max(0, Math.min(1, progressed / total));
    }
  }
  const distancePct =
    hasCurrent && currentPrice! > 0
      ? Math.abs((target - currentPrice!) / currentPrice!) * 100
      : null;

  const snoozed =
    !!alert.snoozed_until && new Date(alert.snoozed_until).getTime() > Date.now();

  let statusBadge: React.ReactNode = null;
  if (triggerCount > 0) {
    statusBadge = (
      <View style={styles.alertBadgeTriggered}>
        <Ionicons name="flash" size={10} color={colors.primary} />
        <Text style={styles.alertBadgeTriggeredText}>
          {triggerCount === 1 ? 'Triggered' : `Triggered ${triggerCount}×`}
        </Text>
      </View>
    );
  } else if (snoozed) {
    statusBadge = (
      <View style={styles.alertBadgeSnoozed}>
        <Ionicons name="moon-outline" size={10} color={SNOOZE_COLOR} />
        <Text style={styles.alertBadgeSnoozedText} numberOfLines={1}>Snoozed</Text>
      </View>
    );
  } else if (alert.status === 'paused') {
    statusBadge = (
      <View style={styles.alertBadgePaused}>
        <Text style={styles.alertBadgePausedText}>Paused</Text>
      </View>
    );
  }

  const row = (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {alert.card_image_uri ? (
        <Image
          source={{ uri: alert.card_image_uri }}
          style={styles.thumb}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <View style={styles.rowNameRow}>
          <Text style={styles.rowName} numberOfLines={1}>
            {alert.card_name}
          </Text>
          {statusBadge}
        </View>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {alert.card_set.toUpperCase()} · #{alert.card_collector_number} · {capitalize(alert.finish)}
        </Text>

        <View style={styles.conditionRow}>
          <Ionicons name={dirIcon} size={13} color={dirColor} />
          <Text style={[styles.conditionText, { color: dirColor }]} numberOfLines={1}>
            {conditionLabel}
          </Text>
          <Text style={styles.conditionTarget} numberOfLines={1}>
            {' · target '}{formatUSD(target)}
            {' · from '}{formatUSD(alert.snapshot_price)}
          </Text>
        </View>

        {/* Mini progress bar */}
        <View style={styles.alertProgressTrack}>
          <View
            style={[
              styles.alertProgressFill,
              { width: `${fraction * 100}%`, backgroundColor: dirColor },
            ]}
          />
          {hasCurrent && (
            <View
              style={[
                styles.alertProgressDot,
                {
                  left: `${fraction * 100}%`,
                  backgroundColor: dirColor,
                  borderColor: colors.surface,
                },
              ]}
            />
          )}
        </View>

        {/* Bottom stats */}
        {hasCurrent ? (
          <Text style={styles.alertStatsLine} numberOfLines={1}>
            <Text style={styles.alertCurrentPrice}>{formatUSD(currentPrice!)}</Text>
            <Text style={[styles.alertDeltaInline, { color: deltaUp ? DIR_UP : DIR_DOWN }]}>
              {' '}({deltaUp ? '+' : ''}{deltaPct.toFixed(2)}%)
            </Text>
            <Text style={styles.alertStatsDot}>{'  ·  '}</Text>
            <Text style={styles.alertStatsMuted}>
              {distancePct != null ? `${distancePct.toFixed(2)}% to target` : 'no data'}
            </Text>
          </Text>
        ) : (
          <Text style={styles.alertStatsMuted}>No market data</Text>
        )}
      </View>
    </TouchableOpacity>
  );

  const isPaused = alert.status === 'paused';

  return (
    <Swipeable
      renderRightActions={() => (
        <View style={styles.swipeActions}>
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionPause]}
            onPress={onTogglePause}
          >
            <Ionicons
              name={isPaused ? 'play' : 'pause'}
              size={22}
              color="#6B7280"
            />
            <Text style={[styles.swipeActionLabel, { color: '#6B7280' }]}>
              {isPaused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.swipeAction]}
            onPress={onSnooze}
          >
            <Ionicons name="moon-outline" size={22} color="#6B8AFF" />
            <Text style={[styles.swipeActionLabel, { color: '#6B8AFF' }]}>
              {snoozed ? 'Snoozed' : 'Snooze'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.swipeAction, styles.swipeActionDelete]}
            onPress={onDelete}
          >
            <Ionicons name="trash-outline" size={22} color={colors.error} />
            <Text style={[styles.swipeActionLabel, { color: colors.error }]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      )}
      overshootRight={false}
      containerStyle={styles.swipeContainer}
    >
      {row}
    </Swipeable>
  );
}

function EventRow({
  event,
  onPress,
}: {
  event: TriggerEventRow;
  onPress: () => void;
}) {
  const dirColor = event.event_direction === 'above' ? DIR_UP : DIR_DOWN;
  const dirIcon = event.event_direction === 'above' ? 'trending-up' : 'trending-down';

  const ageMs = Date.now() - new Date(event.at).getTime();
  const isRecent = ageMs < RECENT_EVENT_WINDOW_MS;

  const verb = event.event_direction === 'below' ? 'dropped to' : 'rose to';
  const deltaVsSnapshot =
    event.snapshot_price > 0
      ? ((event.event_price - event.snapshot_price) / event.snapshot_price) * 100
      : 0;
  const deltaUp = deltaVsSnapshot >= 0;

  return (
    <View style={styles.eventRowWrap}>
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {event.card_image_uri ? (
          <Image
            source={{ uri: event.card_image_uri }}
            style={styles.thumb}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.rowBody}>
          <View style={styles.rowNameRow}>
            <Text style={styles.rowName} numberOfLines={1}>
              {event.card_name}
            </Text>
            {isRecent && (
              <View style={styles.eventNewPill}>
                <Text style={styles.eventNewPillText}>NEW</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {event.card_set.toUpperCase()} · #{event.card_collector_number} · {capitalize(event.finish)}
          </Text>

          {/* Event highlight — the moment captured */}
          <View style={[styles.eventHighlightCard, { backgroundColor: dirColor + '14' }]}>
            <Ionicons name={dirIcon} size={14} color={dirColor} />
            <Text style={[styles.eventHighlightVerb, { color: dirColor }]}>
              {capitalize(verb)} {formatUSD(event.event_price)}
            </Text>
            <Text style={[styles.eventHighlightDelta, { color: dirColor }]}>
              {deltaUp ? '+' : ''}{deltaVsSnapshot.toFixed(2)}%
            </Text>
          </View>

          {/* Context line — snapshot, target, age */}
          <Text style={styles.eventContextLine} numberOfLines={1}>
            from {formatUSD(event.snapshot_price)}
            <Text style={styles.eventContextDot}>{'  ·  '}</Text>
            target {formatUSD(event.target_price)}
            <Text style={styles.eventContextDot}>{'  ·  '}</Text>
            {formatEventAge(event.at)}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

function formatEventAge(iso: string): string {
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
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function GroupedCard({
  card,
  alerts,
  priceMap,
  triggerCounts,
  onOpen,
  onTapAlert,
  onShowActionsAlert,
}: {
  card: {
    card_id: string;
    card_name: string;
    card_set: string;
    card_collector_number: string;
    card_image_uri: string | null;
    finish: PriceAlert['finish'];
  };
  alerts: PriceAlert[];
  priceMap: Map<string, number | null>;
  triggerCounts: Map<string, number>;
  onOpen: () => void;
  onTapAlert: (a: PriceAlert) => void;
  onShowActionsAlert: (a: PriceAlert) => void;
}) {
  return (
    <View style={styles.groupCard}>
      <TouchableOpacity style={styles.groupHeader} onPress={onOpen} activeOpacity={0.7}>
        {card.card_image_uri ? (
          <Image
            source={{ uri: card.card_image_uri }}
            style={styles.groupThumb}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.groupThumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.groupHeaderText}>
          <Text style={styles.groupName} numberOfLines={1}>
            {card.card_name}
          </Text>
          <Text style={styles.groupMeta} numberOfLines={1}>
            {card.card_set.toUpperCase()} · #{card.card_collector_number}
          </Text>
          <Text style={styles.groupCount}>
            {alerts.length} {alerts.length === 1 ? 'alert' : 'alerts'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={styles.groupDivider} />

      <View style={styles.groupAlerts}>
        {alerts.map((a, idx) => (
          <GroupedAlertLine
            key={a.id}
            alert={a}
            currentPrice={priceMap.get(priceKey(a.card_id, a.finish)) ?? null}
            triggerCount={triggerCounts.get(a.id) ?? 0}
            isLast={idx === alerts.length - 1}
            onTap={() => onTapAlert(a)}
            onShowActions={() => onShowActionsAlert(a)}
          />
        ))}
      </View>
    </View>
  );
}

function GroupedAlertLine({
  alert,
  currentPrice,
  triggerCount,
  isLast,
  onTap,
  onShowActions,
}: {
  alert: PriceAlert;
  currentPrice: number | null;
  triggerCount: number;
  isLast: boolean;
  onTap: () => void;
  onShowActions: () => void;
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
  const dirColor = alert.direction === 'above' ? DIR_UP : DIR_DOWN;
  const dirIcon = alert.direction === 'above' ? 'trending-up' : 'trending-down';
  const conditionLabel =
    alert.mode === 'percent'
      ? `${alert.direction === 'above' ? 'Up' : 'Down'} ${Math.abs(alert.target_value)}%`
      : `${alert.direction === 'above' ? 'Above' : 'Below'} ${formatUSD(alert.target_value)}`;

  // Progress fraction along snapshot → target. 0 = at snapshot,
  // 1 = reached target. Direction-aware so the bar always reads
  // "left = start, right = goal".
  let fraction = 0;
  if (hasCurrent) {
    const total = Math.abs(target - alert.snapshot_price);
    if (total > 0) {
      const progressed =
        alert.direction === 'above'
          ? currentPrice! - alert.snapshot_price
          : alert.snapshot_price - currentPrice!;
      fraction = Math.max(0, Math.min(1, progressed / total));
    }
  }

  // Distance % the price still has to move to hit the target.
  const distancePct =
    hasCurrent && currentPrice! > 0
      ? Math.abs((target - currentPrice!) / currentPrice!) * 100
      : null;

  const snoozed =
    !!alert.snoozed_until && new Date(alert.snoozed_until).getTime() > Date.now();

  // Status badge — trigger count wins when present; otherwise paused / snoozed.
  let statusBadge: React.ReactNode = null;
  if (triggerCount > 0) {
    statusBadge = (
      <View style={styles.alertBadgeTriggered}>
        <Ionicons name="flash" size={10} color={colors.primary} />
        <Text style={styles.alertBadgeTriggeredText}>
          {triggerCount === 1 ? 'Triggered' : `Triggered ${triggerCount}×`}
        </Text>
      </View>
    );
  } else if (snoozed) {
    statusBadge = (
      <View style={styles.alertBadgeSnoozed}>
        <Ionicons name="moon-outline" size={10} color={SNOOZE_COLOR} />
        <Text style={styles.alertBadgeSnoozedText} numberOfLines={1}>
          Snoozed
        </Text>
      </View>
    );
  } else if (alert.status === 'paused') {
    statusBadge = (
      <View style={styles.alertBadgePaused}>
        <Text style={styles.alertBadgePausedText}>Paused</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.alertLine, !isLast && styles.alertLineDivider]}
      onPress={onTap}
      activeOpacity={0.7}
    >
      {/* Top row — condition + status badge + actions */}
      <View style={styles.alertTopRow}>
        <View style={styles.alertCondition}>
          <Ionicons name={dirIcon} size={14} color={dirColor} />
          <Text style={[styles.alertConditionText, { color: dirColor }]} numberOfLines={1}>
            {conditionLabel}
          </Text>
          <Text style={styles.alertConditionTarget} numberOfLines={1}>
            {' · target '}{formatUSD(target)}
            {' · from '}{formatUSD(alert.snapshot_price)}
          </Text>
        </View>
        {statusBadge}
        <TouchableOpacity
          onPress={onShowActions}
          hitSlop={8}
          style={styles.alertActionsBtn}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Progress bar — snapshot → target with current dot */}
      <View style={styles.alertProgressTrack}>
        <View
          style={[
            styles.alertProgressFill,
            { width: `${fraction * 100}%`, backgroundColor: dirColor },
          ]}
        />
        {hasCurrent && (
          <View
            style={[
              styles.alertProgressDot,
              {
                left: `${fraction * 100}%`,
                backgroundColor: dirColor,
                borderColor: colors.surface,
              },
            ]}
          />
        )}
      </View>

      {/* Bottom row — current price + delta from snapshot + distance to target */}
      <View style={styles.alertStatsRow}>
        {hasCurrent ? (
          <Text style={styles.alertStatsLine} numberOfLines={1}>
            <Text style={styles.alertCurrentPrice}>{formatUSD(currentPrice!)}</Text>
            <Text style={[styles.alertDeltaInline, { color: deltaUp ? DIR_UP : DIR_DOWN }]}>
              {' '}({deltaUp ? '+' : ''}{deltaPct.toFixed(2)}%)
            </Text>
            <Text style={styles.alertStatsDot}>{'  ·  '}</Text>
            <Text style={styles.alertStatsMuted}>
              {distancePct != null
                ? `${distancePct.toFixed(2)}% to target`
                : 'no data'}
            </Text>
          </Text>
        ) : (
          <Text style={styles.alertStatsMuted}>No market data</Text>
        )}
        <Text style={styles.alertSnapshotMeta} numberOfLines={1}>
          {capitalize(alert.finish)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({
  tab,
  hasQuery,
  onFindCard,
}: {
  tab: TabKey;
  hasQuery: boolean;
  onFindCard: () => void;
}) {
  if (hasQuery) {
    return (
      <View style={styles.empty}>
        <Ionicons name="search" size={40} color={colors.textMuted} />
        <Text style={styles.emptyTitle}>No matches</Text>
        <Text style={styles.emptyBody}>Try a different card name, set, or number.</Text>
      </View>
    );
  }
  const copy =
    tab === 'all'
      ? {
          title: 'No alerts yet',
          body: 'Tap the bell on a card to catch targets as they move.',
          cta: 'Find a card' as string | null,
        }
      : tab === 'paused'
        ? {
            title: 'Nothing paused',
            body: 'Pause an alert from its ⋯ menu to stop it temporarily.',
            cta: null as string | null,
          }
        : {
            title: 'No triggers yet',
            body: 'Every time one of your alerts fires, it lands here as a permanent record.',
            cta: null as string | null,
          };

  return (
    <View style={styles.empty}>
      <Ionicons name="notifications-outline" size={40} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>{copy.title}</Text>
      <Text style={styles.emptyBody}>{copy.body}</Text>
      {copy.cta && (
        <TouchableOpacity style={styles.emptyCta} onPress={onFindCard} activeOpacity={0.85}>
          <Text style={styles.emptyCtaText}>{copy.cta}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatSnoozeUntil(iso: string): string {
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
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.md + 2,
  },
  flexFill: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Header card — full-bleed white with bottom radius + sm shadow.
  headerCard: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    ...shadows.sm,
  },
  headerInner: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm + 2,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  plusButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxxl,
    fontWeight: '800',
    letterSpacing: -1,
  },
  metaLine: {
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  metaBold: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  metaDot: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  description: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    paddingHorizontal: spacing.md,
    height: 38,
    marginTop: spacing.sm + 2,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: 0,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    backgroundColor: colors.warningLight,
    borderRadius: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  limitBannerText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    flex: 1,
  },
  // Toolbar (tabs + view mode)
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm + 2,
    gap: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    flex: 1,
  },
  tab: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
  },
  tabActive: {
    backgroundColor: colors.primary + '14',
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  sortBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewModeGroup: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 6,
    padding: 2,
  },
  viewModeBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  viewModeBtnActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  // Grouped-by-card
  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
    ...shadows.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  groupThumb: {
    width: 52,
    height: 72,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  groupHeaderText: { flex: 1 },
  groupName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  groupMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  groupCount: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: 4,
  },
  groupDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  groupAlerts: {
    paddingVertical: spacing.xs,
  },
  // ── Alert line (grouped view) — narrative two-row layout
  //    [condition + target]              [status badge] [⋯]
  //    [snapshot ─────●───── target]   (mini progress bar)
  //    [$current (+Δ%) · X% to target]    [Foil · from $snapshot]
  alertLine: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: 6,
  },
  alertLineDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  alertTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  alertCondition: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  alertConditionText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  alertConditionTarget: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    flexShrink: 1,
  },
  alertActionsBtn: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },

  // Status badges (right side of top row)
  alertBadgeTriggered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  alertBadgeTriggeredText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  alertBadgeSnoozed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: SNOOZE_COLOR + '1A',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  alertBadgeSnoozedText: {
    color: SNOOZE_COLOR,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  alertBadgePaused: {
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  alertBadgePausedText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  // Mini progress bar (snapshot → current → target)
  alertProgressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    position: 'relative',
    marginVertical: 2,
  },
  alertProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 2,
  },
  alertProgressDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    top: -3,
    marginLeft: -5,
    borderWidth: 2,
  },

  // Bottom stats row
  alertStatsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  alertStatsLine: {
    flex: 1,
    fontSize: fontSize.xs,
    minWidth: 0,
  },
  alertCurrentPrice: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  alertDeltaInline: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  alertStatsDot: {
    color: colors.textMuted,
  },
  alertStatsMuted: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  alertSnapshotMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  // List
  list: {
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  swipeContainer: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  eventRowWrap: {
    marginBottom: spacing.sm,
  },
  // Event highlight — tinted card with the captured moment
  eventHighlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: 6,
    marginTop: 8,
  },
  eventHighlightVerb: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  eventHighlightDelta: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  eventContextLine: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 4,
  },
  eventContextDot: {
    color: colors.textMuted,
  },
  eventNewPill: {
    backgroundColor: colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventNewPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  thumb: {
    width: 44,
    height: 62,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  thumbPlaceholder: {},
  rowBody: { flex: 1, minWidth: 0 },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
  },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2, fontWeight: '500' },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    minWidth: 0,
  },
  conditionText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  conditionTarget: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    flexShrink: 1,
  },
  rowRight: { alignItems: 'flex-end' },
  currentValue: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  deltaText: { fontSize: fontSize.xs, fontWeight: '700' },
  snapshotLabel: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  triggeredBadge: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#F9E5A9',
    borderRadius: borderRadius.sm,
  },
  triggeredBadgeText: { color: '#7C5E1A', fontSize: fontSize.xs, fontWeight: '700' },
  pausedBadge: {
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
  },
  pausedBadgeText: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '700' },
  snoozeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#6B8AFF1A',
    borderRadius: borderRadius.sm,
  },
  snoozeBadgeText: {
    color: SNOOZE_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  snoozeBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#6B8AFF1A',
    borderRadius: borderRadius.sm,
  },
  snoozeBadgeInlineText: {
    color: SNOOZE_COLOR,
    fontSize: 10,
    fontWeight: '700',
  },
  deleteAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swipeActions: {
    flexDirection: 'row',
  },
  swipeAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  swipeActionPause: {},
  swipeActionDelete: {},
  swipeActionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  groupLineBtnGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  groupLineBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pausedBadgeInline: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
  },
  pausedBadgeInlineText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  // Empty
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    backgroundColor: colors.background,
  },
  emptyTitle: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  emptyBody: { color: colors.textSecondary, fontSize: fontSize.sm, textAlign: 'center', lineHeight: 20 },
  emptyCta: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 10,
  },
  emptyCtaText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '700' },
});
