import { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Animated,
  Alert as RNAlert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
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
  simulateCurrentPrice,
  MAX_ACTIVE_ALERTS_PER_USER,
  type PriceAlert,
  type PriceAlertStatus,
} from '../../src/lib/priceAlerts';
import { CreateAlertSheet } from '../../src/components/CreateAlertSheet';

type TabKey = PriceAlertStatus | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'Active' },
  { key: 'triggered', label: 'Triggered' },
  { key: 'all', label: 'All' },
];

const DIR_UP = '#1D9E58';
const DIR_DOWN = '#C24848';
const HEADER_BLUE = '#023BFD';
const HEADER_BLUE_DARK = '#011F9A';

// How far you scroll before the expanded hero is fully collapsed.
const COLLAPSE_DISTANCE = 80;

export default function AlertsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('active');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('flat');
  const [editing, setEditing] = useState<{ alert: PriceAlert; card: ScryfallCard | null } | null>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const { data: rows } = useQuery<PriceAlert>(
    `SELECT id, user_id, card_id, card_name, card_set, card_collector_number,
            card_image_uri, finish, direction, mode, target_value, snapshot_price,
            status, created_at, triggered_at, updated_at
       FROM price_alerts
      ORDER BY CASE status WHEN 'triggered' THEN 0 WHEN 'active' THEN 1 ELSE 2 END,
               created_at DESC`
  );

  const activeUsageCount = useMemo(
    () => (rows ?? []).filter((a) => a.status === 'active').length,
    [rows]
  );
  const nearLimit =
    activeUsageCount >= Math.floor(MAX_ACTIVE_ALERTS_PER_USER * 0.8);

  const alerts = useMemo(() => {
    const all = rows ?? [];
    const byTab = tab === 'all' ? all : all.filter((a) => a.status === tab);
    const q = search.trim().toLowerCase();
    if (!q) return byTab;
    return byTab.filter(
      (a) =>
        a.card_name.toLowerCase().includes(q) ||
        a.card_set.toLowerCase().includes(q) ||
        a.card_collector_number.toLowerCase().includes(q)
    );
  }, [rows, tab, search]);

  // Kicker next to tabs: count of the currently visible tab.
  const tabCount = alerts.length;
  const tabCountLabel =
    tab === 'active'
      ? `${tabCount} active`
      : tab === 'triggered'
        ? `${tabCount} triggered`
        : `${tabCount} total`;

  // Grouped-by-card: one entry per card_id, with all its alerts under it.
  const grouped = useMemo(() => {
    const byCard = new Map<string, { card: Pick<PriceAlert, 'card_id' | 'card_name' | 'card_set' | 'card_collector_number' | 'card_image_uri' | 'finish'>; alerts: PriceAlert[] }>();
    for (const a of alerts) {
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
  }, [alerts]);

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

  // Crossfade: expanded big title visible at top; collapses as scrollY grows.
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE * 0.7],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const expandedTranslate = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE],
    outputRange: [0, -COLLAPSE_DISTANCE / 3],
    extrapolate: 'clamp',
  });
  const compactTitleOpacity = scrollY.interpolate({
    inputRange: [COLLAPSE_DISTANCE * 0.5, COLLAPSE_DISTANCE],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const compactTitleTranslate = scrollY.interpolate({
    inputRange: [COLLAPSE_DISTANCE * 0.5, COLLAPSE_DISTANCE],
    outputRange: [12, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Fixed top bar — back + compact title (crossfade) + add */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Animated.Text
          style={[
            styles.compactTitle,
            {
              opacity: compactTitleOpacity,
              transform: [{ translateX: compactTitleTranslate }],
            },
          ]}
          numberOfLines={1}
        >
          Price Alerts
        </Animated.Text>
        <TouchableOpacity
          onPress={() => router.push('/(tabs)/search')}
          hitSlop={8}
          accessibilityLabel="Create new alert"
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Animated.ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >
        {/* Expanded hero content — scrolls away normally */}
        <Animated.View
          style={[
            styles.heroExpanded,
            {
              opacity: expandedOpacity,
              transform: [{ translateY: expandedTranslate }],
            },
          ]}
        >
          {/* Extends the hero's blue background upward into the overscroll
              area so pull-to-refresh bounces stay blue instead of revealing
              the white ScrollView background. */}
          <View pointerEvents="none" style={styles.heroOverscrollBg} />
          <Text style={styles.heroTitle}>Price Alerts</Text>
          <Text style={styles.heroSubtitle}>
            Get notified when cards hit your target — catch good entries or lock in gains.
          </Text>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color="rgba(255,255,255,0.7)" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by card, set, or number"
              placeholderTextColor="rgba(255,255,255,0.6)"
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.7)" />
              </TouchableOpacity>
            )}
          </View>

          {nearLimit && (
            <View style={styles.limitBanner}>
              <Ionicons name="warning-outline" size={16} color="#FFFFFF" />
              <Text style={styles.limitBannerText}>
                {activeUsageCount} / {MAX_ACTIVE_ALERTS_PER_USER} active — close to the limit.
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Sticky tabs + kicker */}
        <View style={styles.tabsWrap}>
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
            <View style={{ flex: 1 }} />
            <Text style={styles.kicker}>{tabCountLabel}</Text>
            <View style={styles.viewModeGroup}>
              <TouchableOpacity
                onPress={() => setViewMode('flat')}
                style={[styles.viewModeBtn, viewMode === 'flat' && styles.viewModeBtnActive]}
                hitSlop={6}
                accessibilityLabel="Flat view"
              >
                <Ionicons
                  name="list-outline"
                  size={16}
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
                  size={16}
                  color={viewMode === 'grouped' ? colors.primary : colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* List or empty state */}
        {alerts.length === 0 ? (
          <View style={styles.flexFill}>
            <EmptyState
              tab={tab}
              hasQuery={search.trim().length > 0}
              onFindCard={() => router.push('/(tabs)/search')}
            />
          </View>
        ) : viewMode === 'flat' ? (
          <View style={styles.list}>
            {alerts.map((a) => (
              <AlertRow
                key={a.id}
                alert={a}
                onPress={() => openEdit(a)}
                onDelete={() => confirmDelete(a)}
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
                onOpen={() =>
                  router.push({
                    pathname: '/card/[id]',
                    params: { id: g.card.card_id },
                  })
                }
                onEditAlert={openEdit}
                onDeleteAlert={confirmDelete}
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
    </View>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function AlertRow({
  alert,
  onPress,
  onDelete,
}: {
  alert: PriceAlert;
  onPress: () => void;
  onDelete: () => void;
}) {
  const target = computeTargetUsd(
    alert.snapshot_price,
    alert.mode,
    alert.direction,
    alert.target_value
  );
  const current = simulateCurrentPrice(alert.id, alert.snapshot_price);
  const deltaAbs = current - alert.snapshot_price;
  const deltaPct =
    alert.snapshot_price > 0 ? (deltaAbs / alert.snapshot_price) * 100 : 0;
  const deltaUp = deltaAbs >= 0;

  const dirColor = alert.direction === 'above' ? DIR_UP : DIR_DOWN;
  const dirIcon = alert.direction === 'above' ? 'trending-up' : 'trending-down';
  const conditionLabel =
    alert.mode === 'percent'
      ? `${alert.direction === 'below' ? '−' : '+'}${Math.abs(alert.target_value)}%`
      : `${alert.direction === 'below' ? 'Below' : 'Above'} ${formatUSD(alert.target_value)}`;

  const row = (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
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
        <Text style={styles.rowName} numberOfLines={1}>
          {alert.card_name}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {alert.card_set.toUpperCase()} · #{alert.card_collector_number} · {capitalize(alert.finish)}
        </Text>
        <View style={styles.conditionRow}>
          <Ionicons name={dirIcon} size={14} color={dirColor} />
          <Text style={[styles.conditionText, { color: dirColor }]}>{conditionLabel}</Text>
          {alert.mode === 'percent' && (
            <Text style={styles.conditionTarget}>→ {formatUSD(target)}</Text>
          )}
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.currentValue}>{formatUSD(current)}</Text>
        <View style={styles.deltaRow}>
          <Ionicons
            name={deltaUp ? 'caret-up' : 'caret-down'}
            size={10}
            color={deltaUp ? DIR_UP : DIR_DOWN}
          />
          <Text style={[styles.deltaText, { color: deltaUp ? DIR_UP : DIR_DOWN }]}>
            {deltaUp ? '+' : ''}{deltaPct.toFixed(1)}%
          </Text>
        </View>
        <Text style={styles.snapshotLabel}>from {formatUSD(alert.snapshot_price)}</Text>
        {alert.status === 'triggered' && (
          <View style={styles.triggeredBadge}>
            <Text style={styles.triggeredBadgeText}>Triggered</Text>
          </View>
        )}
        {alert.status === 'paused' && (
          <View style={styles.pausedBadge}>
            <Text style={styles.pausedBadgeText}>Paused</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <Swipeable
      renderRightActions={() => (
        <TouchableOpacity style={styles.deleteAction} onPress={onDelete}>
          <Ionicons name="trash-outline" size={24} color={colors.error} />
        </TouchableOpacity>
      )}
      overshootRight={false}
      containerStyle={styles.swipeContainer}
    >
      {row}
    </Swipeable>
  );
}

function GroupedCard({
  card,
  alerts,
  onOpen,
  onEditAlert,
  onDeleteAlert,
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
  onOpen: () => void;
  onEditAlert: (a: PriceAlert) => void;
  onDeleteAlert: (a: PriceAlert) => void;
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
        {alerts.map((a) => (
          <GroupedAlertLine
            key={a.id}
            alert={a}
            onEdit={() => onEditAlert(a)}
            onDelete={() => onDeleteAlert(a)}
          />
        ))}
      </View>
    </View>
  );
}

function GroupedAlertLine({
  alert,
  onEdit,
  onDelete,
}: {
  alert: PriceAlert;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const target = computeTargetUsd(
    alert.snapshot_price,
    alert.mode,
    alert.direction,
    alert.target_value
  );
  const current = simulateCurrentPrice(alert.id, alert.snapshot_price);
  const deltaPct =
    alert.snapshot_price > 0
      ? ((current - alert.snapshot_price) / alert.snapshot_price) * 100
      : 0;
  const deltaUp = deltaPct >= 0;
  const dirColor = alert.direction === 'above' ? DIR_UP : DIR_DOWN;
  const dirIcon = alert.direction === 'above' ? 'trending-up' : 'trending-down';
  const conditionLabel =
    alert.mode === 'percent'
      ? `${alert.direction === 'below' ? '−' : '+'}${Math.abs(alert.target_value)}%`
      : `${alert.direction === 'below' ? 'Below' : 'Above'} ${formatUSD(alert.target_value)}`;

  return (
    <TouchableOpacity
      style={styles.groupLine}
      onPress={onEdit}
      activeOpacity={0.7}
    >
      <View style={styles.groupLineLeft}>
        <View style={styles.groupLineCondition}>
          <Ionicons name={dirIcon} size={13} color={dirColor} />
          <Text style={[styles.groupLineConditionText, { color: dirColor }]}>
            {conditionLabel}
          </Text>
          {alert.mode === 'percent' && (
            <Text style={styles.groupLineTargetText}>→ {formatUSD(target)}</Text>
          )}
        </View>
        <Text style={styles.groupLineMeta}>
          {capitalize(alert.finish)} · from {formatUSD(alert.snapshot_price)}
        </Text>
      </View>

      <View style={styles.groupLineRight}>
        <Text style={styles.groupLineCurrent}>{formatUSD(current)}</Text>
        <Text style={[styles.groupLineDelta, { color: deltaUp ? DIR_UP : DIR_DOWN }]}>
          {deltaUp ? '+' : ''}{deltaPct.toFixed(1)}%
        </Text>
      </View>

      <TouchableOpacity onPress={onDelete} hitSlop={10} style={styles.groupLineDelete}>
        <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
      </TouchableOpacity>
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
    tab === 'active'
      ? {
          title: 'No active alerts',
          body: 'Tap the bell on a card to catch targets as they move.',
          cta: 'Find a card' as string | null,
        }
      : tab === 'triggered'
        ? {
            title: 'Nothing triggered yet',
            body: 'Alerts that cross their target will land here.',
            cta: null as string | null,
          }
        : {
            title: 'No alerts yet',
            body: 'Create your first alert from any card detail.',
            cta: 'Find a card' as string | null,
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
  },
  flexFill: {
    flex: 1,
    backgroundColor: colors.background,
  },
  // Fixed top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: HEADER_BLUE,
    zIndex: 10,
  },
  compactTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  // Expanded hero content
  heroExpanded: {
    backgroundColor: HEADER_BLUE,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
  },
  heroOverscrollBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -1000,
    height: 1000,
    backgroundColor: HEADER_BLUE,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: fontSize.xxxl,
    fontWeight: '800',
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: HEADER_BLUE_DARK,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginTop: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.md,
    paddingVertical: 0,
  },
  limitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  limitBannerText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '600',
    flex: 1,
  },
  // Sticky tabs row
  tabsWrap: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  tab: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.primary + '10',
    borderColor: colors.primary,
  },
  tabText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '600' },
  tabTextActive: { color: colors.primary },
  kicker: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginRight: spacing.sm,
  },
  viewModeGroup: {
    flexDirection: 'row',
    gap: 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    padding: 2,
  },
  viewModeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm - 2,
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
  groupLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  groupLineLeft: { flex: 1 },
  groupLineCondition: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupLineConditionText: { fontSize: fontSize.sm, fontWeight: '700' },
  groupLineTargetText: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
  groupLineMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  groupLineRight: {
    alignItems: 'flex-end',
  },
  groupLineCurrent: { color: colors.text, fontSize: fontSize.sm, fontWeight: '700' },
  groupLineDelta: { fontSize: fontSize.xs, fontWeight: '700', marginTop: 2 },
  groupLineDelete: {
    paddingHorizontal: 4,
    paddingVertical: 4,
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
  thumb: {
    width: 44,
    height: 62,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  thumbPlaceholder: {},
  rowBody: { flex: 1 },
  rowName: { color: colors.text, fontSize: fontSize.md, fontWeight: '700' },
  rowMeta: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  conditionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  conditionText: { fontSize: fontSize.sm, fontWeight: '700' },
  conditionTarget: { color: colors.textSecondary, fontSize: fontSize.sm, fontWeight: '500' },
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
  deleteAction: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: borderRadius.md,
  },
  emptyCtaText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '700' },
});
