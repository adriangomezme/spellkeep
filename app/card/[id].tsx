import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  LayoutAnimation,
  Platform,
  UIManager,
  FlatList,
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  Extrapolation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScryfallCard,
  getCard,
  getCardImageUri,
  fetchPrints,
  fetchRulings,
  formatUSD,
  type ScryfallRuling,
} from '../../src/lib/scryfall';
import { AddCardSheet } from '../../src/components/AddCardSheet';
import { CreateAlertSheet } from '../../src/components/CreateAlertSheet';
import { CardAlertsSheet } from '../../src/components/CardAlertsSheet';
import {
  fetchCardExtras,
  fetchSetIcon,
  fetchSetIcons,
} from '../../src/lib/cardDetail';
import { adjustOwnershipQuantityLocal, addCardToCollectionLocal } from '../../src/lib/collections.local';
import { useQuickAddTargetId, setQuickAddTargetId, pickQuickAddFinish } from '../../src/lib/quickAdd';
import { useQuery as usePowerSyncQuery } from '@powersync/react';
import { DestinationPickerModal } from '../../src/components/DestinationPickerModal';
import type { CollectionSummary, CollectionType } from '../../src/lib/collections';
import { showToast } from '../../src/components/Toast';
import { QuickAddButton, type QuickAddButtonHandle } from '../../src/components/QuickAddButton';
import { PrimaryCTA } from '../../src/components/PrimaryCTA';
import * as Haptics from 'expo-haptics';
import {
  useOwnershipSummary,
  useOwnedQtyByOracleId,
  type OwnershipEntry,
  type OwnershipSummary,
} from '../../src/lib/hooks/useOwnershipSummary';
import { ensureSetIconsLoaded, getSetIconSync } from '../../src/lib/catalog/catalogDb';
import { addRecentlyViewed } from '../../src/lib/hooks/useRecentlyViewedCards';
import { stagePendingSearch } from '../../src/lib/search/pendingSyntaxQuery';
import { CONDITIONS, type Condition, type Finish } from '../../src/lib/collection';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const RARITY_COLORS: Record<string, string> = {
  common: '#6B7280',
  uncommon: '#9CA3AF',
  rare: '#D4A24C',
  mythic: '#D2682B',
  special: '#A371D6',
  bonus: '#A371D6',
};

const LEGALITY_FORMATS: { key: string; label: string }[] = [
  { key: 'standard', label: 'Standard' },
  { key: 'alchemy', label: 'Alchemy' },
  { key: 'pioneer', label: 'Pioneer' },
  { key: 'historic', label: 'Historic' },
  { key: 'modern', label: 'Modern' },
  { key: 'brawl', label: 'Brawl' },
  { key: 'legacy', label: 'Legacy' },
  { key: 'timeless', label: 'Timeless' },
  { key: 'vintage', label: 'Vintage' },
  { key: 'pauper', label: 'Pauper' },
  { key: 'commander', label: 'Commander' },
  { key: 'penny', label: 'Penny' },
  { key: 'oathbreaker', label: 'Oathbreaker' },
  { key: 'explorer', label: 'Explorer' },
];

function priceFromCard(card: ScryfallCard, key: 'usd' | 'usd_foil' | 'usd_etched'): number | null {
  const raw = card.prices?.[key];
  return raw ? parseFloat(raw) : null;
}

const MULTI_FACE_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'double_faced_token',
  'reversible_card',
  'art_series',
]);

const HERO_IMAGE_WIDTH = 312;
const HERO_IMAGE_HEIGHT = 437;
const HERO_FACE_GAP = 12;

function isMultiFaceCard(card: ScryfallCard): boolean {
  return MULTI_FACE_LAYOUTS.has(card.layout ?? '');
}

function getFaceImages(card: ScryfallCard): string[] {
  const faces = card.card_faces ?? [];
  const uris: string[] = [];
  for (const f of faces) {
    const src = f.image_uris;
    if (!src) continue;
    const uri = src.large ?? src.normal ?? src.small;
    if (uri) uris.push(uri);
  }
  return uris;
}

function isFinishAvailable(card: ScryfallCard, finish: 'normal' | 'foil' | 'etched'): boolean {
  if (card.finishes && card.finishes.length > 0) {
    if (finish === 'normal') return card.finishes.includes('nonfoil');
    return card.finishes.includes(finish);
  }
  if (finish === 'normal') return !!card.prices?.usd;
  if (finish === 'foil') return !!card.prices?.usd_foil;
  return !!card.prices?.usd_etched;
}

export default function CardDetailScreen() {
  const { id, cardJson, fromCollectionId } = useLocalSearchParams<{
    id: string;
    cardJson: string;
    // When the card is opened from inside a specific binder/list detail,
    // the caller passes that collection id here so the AddCardSheet
    // pre-selects it as the destination.
    fromCollectionId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const initialCard: ScryfallCard | null = useMemo(() => {
    try {
      return cardJson ? JSON.parse(cardJson) : null;
    } catch {
      return null;
    }
  }, [cardJson]);

  const [card, setCard] = useState<ScryfallCard | null>(initialCard);
  // Tracks whether the async lookup is still in flight. Without this we
  // flash "Card not found" for the duration of the fetch when the route
  // is opened without a `cardJson` param (e.g. from /alerts/[id] tap).
  const [fetching, setFetching] = useState<boolean>(!initialCard);

  // Reset and lazy-refresh whenever the route changes. We resolve the
  // card metadata and the detail-only "extras" in parallel, merge them
  // together, then commit in a single setCard call so neither response
  // can clobber the other. Offline: extras fails silently and the page
  // renders with just the local catalog fields.
  useEffect(() => {
    setCard(initialCard);
    setFetching(!initialCard);
    if (!id) return;
    Promise.all([
      getCard(id).catch(() => null),
      fetchCardExtras(id).catch(() => null),
    ])
      .then(([baseCard, extras]) => {
        if (!baseCard && !extras) return;
        if (!baseCard) return;
        setCard(extras ? { ...baseCard, ...extras } : baseCard);
      })
      .finally(() => setFetching(false));
  }, [id, initialCard]);

  // Record this card view for the Search tab's "Recently viewed" list.
  // We log once per route entry as soon as we have ANY card data —
  // either the inline cardJson from the navigator or the fetched
  // baseCard. The hook dedupes by id so re-merging extras doesn't
  // double-count.
  useEffect(() => {
    if (!card) return;
    void addRecentlyViewed(card);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card?.id]);

  const [showAddSheet, setShowAddSheet] = useState(false);
  // Quick Add: one-tap add to a pre-configured binder/list. Long press
  // (or first-time tap without target) opens a picker.
  const [showQuickAddPicker, setShowQuickAddPicker] = useState(false);
  const quickAddTargetId = useQuickAddTargetId();
  const quickAddBtnRef = useRef<QuickAddButtonHandle | null>(null);
  // Two separate queries so the picker can paint instantly on long-
  // press. The collections SELECT is trivial (no JOIN), emits in a
  // tick; the counts aggregate may take a while on large datasets but
  // doesn't block showing the binder names in the list.
  const quickAddCollectionsRows = usePowerSyncQuery<{
    id: string;
    name: string;
    type: CollectionType;
    color: string | null;
  }>(
    `SELECT id, name, type, color
       FROM collections
      ORDER BY CASE type WHEN 'binder' THEN 0 ELSE 1 END, LOWER(name)`
  );
  const quickAddCountsRows = usePowerSyncQuery<{
    collection_id: string;
    card_count: number;
    unique_cards: number;
  }>(
    `SELECT cc.collection_id,
            SUM(cc.quantity_normal + cc.quantity_foil + cc.quantity_etched) AS card_count,
              SUM(CASE WHEN cc.quantity_normal > 0 THEN 1 ELSE 0 END)
            + SUM(CASE WHEN cc.quantity_foil   > 0 THEN 1 ELSE 0 END)
            + SUM(CASE WHEN cc.quantity_etched > 0 THEN 1 ELSE 0 END) AS unique_cards
       FROM collection_cards cc
      GROUP BY cc.collection_id`
  );
  const quickAddCountsMap = useMemo(() => {
    const m = new Map<string, { card_count: number; unique_cards: number }>();
    for (const r of quickAddCountsRows.data ?? []) {
      m.set(r.collection_id, {
        card_count: Number(r.card_count ?? 0),
        unique_cards: Number(r.unique_cards ?? 0),
      });
    }
    return m;
  }, [quickAddCountsRows.data]);
  const quickAddDestinations = useMemo<CollectionSummary[]>(
    () =>
      (quickAddCollectionsRows.data ?? []).map((r) => {
        const counts = quickAddCountsMap.get(r.id);
        return {
          id: r.id,
          name: r.name,
          type: r.type,
          folder_id: null,
          color: r.color,
          card_count: counts?.card_count ?? 0,
          unique_cards: counts?.unique_cards ?? 0,
          total_value: 0,
        };
      }),
    [quickAddCollectionsRows.data, quickAddCountsMap]
  );
  const quickAddTarget = useMemo(
    () => quickAddDestinations.find((d) => d.id === quickAddTargetId) ?? null,
    [quickAddDestinations, quickAddTargetId]
  );

  async function performQuickAdd(collectionId: string, accentColor: string | null) {
    if (!card) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    const finish = pickQuickAddFinish(card);
    try {
      await addCardToCollectionLocal({
        card,
        collectionId,
        condition: 'NM',
        finish,
        quantity: 1,
      });
      quickAddBtnRef.current?.playSuccess(accentColor);
    } catch (err: any) {
      showToast(err?.message ?? 'Quick add failed');
    }
  }

  function handleQuickAddTap() {
    if (!card) return;

    // No stored target at all — first-time use, prompt the user.
    if (!quickAddTargetId) {
      setShowQuickAddPicker(true);
      return;
    }

    // Destinations have hydrated AND the stored id isn't in the list:
    // the target was deleted. Clear storage and prompt for a new one.
    if (quickAddDestinations.length > 0 && !quickAddTarget) {
      setQuickAddTargetId(null);
      setShowQuickAddPicker(true);
      return;
    }

    // Otherwise proceed with the stored id. The accent color lights up
    // the "+1" burst so users can tell which binder received the add
    // without reading any text.
    performQuickAdd(quickAddTargetId, quickAddTarget?.color ?? null);
  }

  async function handleQuickAddTargetPicked(id: string) {
    await setQuickAddTargetId(id);
    const picked = quickAddDestinations.find((d) => d.id === id);
    if (picked) performQuickAdd(picked.id, picked.color ?? null);
  }
  const ownership: OwnershipSummary | null = useOwnershipSummary(card?.id) ?? null;
  const [prints, setPrints] = useState<ScryfallCard[]>([]);
  const [printsLoading, setPrintsLoading] = useState(false);
  const [showAlertSheet, setShowAlertSheet] = useState(false);
  // Persistent count: all alerts for this print, regardless of status.
  // Users asked for the bell badge to stick around even when every alert
  // is paused or triggered, so pausing doesn't make it look like the card
  // has no alerts anymore.
  const alertRows = usePowerSyncQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM price_alerts WHERE card_id = ?`,
    [id ?? '']
  );
  const alertCount = Number(alertRows.data?.[0]?.cnt ?? 0);
  // Seed the set icon from the in-memory catalog cache so the glyph paints
  // on first render instead of flashing in after the async fetch resolves.
  const [setIconUri, setSetIconUri] = useState<string | null>(() =>
    initialCard?.set ? getSetIconSync(initialCard.set) : null
  );
  const [printSetIcons, setPrintSetIcons] = useState<Record<string, string>>({});
  const printOwned = useOwnedQtyByOracleId(card?.oracle_id);
  const [rulings, setRulings] = useState<ScryfallRuling[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!card?.oracle_id) return;
    setPrintsLoading(true);
    fetchPrints(card.oracle_id)
      .then(setPrints)
      .catch(() => setPrints([]))
      .finally(() => setPrintsLoading(false));
  }, [card?.oracle_id]);

  useEffect(() => {
    if (!card?.set) return;
    // Fast path: map is already populated (second card onwards this
    // session). Paints in a single frame.
    const syncHit = getSetIconSync(card.set);
    if (syncHit) {
      setSetIconUri(syncHit);
      return;
    }
    // First card of the session — lazy-load the full map once, then read.
    // Cheap (~1031 rows, ~50 ms from on-device SQLite), amortises over
    // every subsequent icon read for the rest of the session.
    let cancelled = false;
    ensureSetIconsLoaded()
      .then(() => {
        if (cancelled || !card?.set) return;
        const hit = getSetIconSync(card.set);
        if (hit) setSetIconUri(hit);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [card?.set]);

  // Fetch set icons for all prints in one batch
  useEffect(() => {
    if (prints.length === 0) return;
    const codes = prints.map((p) => p.set).filter(Boolean) as string[];
    fetchSetIcons(codes).then(setPrintSetIcons).catch(() => setPrintSetIcons({}));
  }, [prints]);

  // printOwned is derived via useOwnedQtyByOracleId — live update on +/-.

  // World-class scroll-driven header (Apple News / App Store pattern).
  // Hooks MUST be declared before the `if (!card)` early return below —
  // otherwise navigating here without a preloaded cardJson (e.g. from
  // price alerts) skips these hooks on the loading frame and tips over
  // React's "same hook order every render" rule.
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  const blurStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 120], [0, 1], Extrapolation.CLAMP),
  }));
  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [120, 180], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [120, 180], [6, 0], Extrapolation.CLAMP) },
    ],
  }));

  if (!card) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        {fetching ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : (
          <Text style={styles.errorText}>Card not found</Text>
        )}
      </View>
    );
  }

  const multiFace = isMultiFaceCard(card);
  const imageUri = getCardImageUri(card, 'large');
  const rarityColor = RARITY_COLORS[card.rarity] ?? colors.textSecondary;
  const ownedBinder = ownership?.binderTotal ?? 0;

  return (
    <View style={styles.container}>
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, blurStyle]}>
          <BlurView
            tint="light"
            intensity={8}
            style={[StyleSheet.absoluteFillObject, styles.headerBlur]}
          />
        </Animated.View>
        <Header
          title={card.name}
          owned={ownedBinder}
          ownedReady={ownership !== null}
          titleStyle={titleStyle}
          onBack={() => router.back()}
          alertCount={alertCount}
          onOpenAlert={() => setShowAlertSheet(true)}
        />
      </View>

      <Animated.ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            // Content starts just under the status bar so the hero can
            // breathe into the header region. The header (back + alert)
            // floats on top at y=0 with no blur — the card art shows
            // through to the very top edge with a hair of breathing room.
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 96,
          },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
      >
        {/* Hero image */}
        {multiFace ? (
          <HeroFaceCarousel card={card} fallbackUri={imageUri} />
        ) : (
          <View style={styles.hero}>
            <View style={styles.heroImageWrap}>
              <Image
                source={{ uri: imageUri }}
                style={styles.heroImage}
                contentFit="contain"
                transition={200}
                cachePolicy="memory-disk"
              />
            </View>
          </View>
        )}

        {/* Identity */}
        <Section>
          <View style={styles.nameRow}>
            <Text style={styles.cardName}>{card.name}</Text>
            {!!(card.mana_cost ?? card.card_faces?.[0]?.mana_cost) && (
              <Text style={styles.manaCost}>
                {card.mana_cost ?? card.card_faces?.[0]?.mana_cost}
              </Text>
            )}
          </View>

          <Text style={styles.typeLine}>
            {card.type_line ?? card.card_faces?.[0]?.type_line}
          </Text>

          {/* Set: text + icon line */}
          <View style={styles.setRow}>
            {setIconUri && (
              <Image
                source={{ uri: setIconUri }}
                style={styles.setIcon}
                contentFit="contain"
                tintColor={colors.text}
              />
            )}
            <Text style={styles.setName} numberOfLines={1}>
              {card.set_name}
            </Text>
            <Text style={styles.setCode}>· {(card.set ?? '').toUpperCase()}</Text>
          </View>

          <View style={styles.metaRow}>
            <MetaPill label={`#${card.collector_number}`} />
            <MetaPill label={card.rarity} color={rarityColor} dot />
            <MetaPill
              label={`Illus. ${card.artist ?? 'Unknown'}`}
              icon="brush-outline"
              onPress={card.artist ? () => {
                // Hand off the Scryfall artist syntax to the Search
                // tab. We intentionally use TEXT (a:"Name") rather
                // than a structured filter because the user prefers
                // browsing by typed query — that way the recent gets
                // saved as the syntax string, re-running it is just a
                // tap on the recent entry, and the toolbar shows zero
                // active filters.
                const q = `a:"${card.artist!.replace(/"/g, '')}"`;
                stagePendingSearch({ kind: 'syntax', query: q });
                router.push('/(tabs)/search');
              } : undefined}
            />
          </View>
        </Section>

        {/* Pricing */}
        <Section title="Market price">
          <View style={styles.priceGrid}>
            <PriceCell
              label="Normal"
              value={priceFromCard(card, 'usd')}
              available={isFinishAvailable(card, 'normal')}
            />
            <View style={styles.priceCellDivider} />
            <PriceCell
              label="Foil"
              value={priceFromCard(card, 'usd_foil')}
              available={isFinishAvailable(card, 'foil')}
            />
            <View style={styles.priceCellDivider} />
            <PriceCell
              label="Etched"
              value={priceFromCard(card, 'usd_etched')}
              available={isFinishAvailable(card, 'etched')}
            />
          </View>
        </Section>

        {/* In your collection */}
        <Section
          title="In your collection"
          accent="#E5E7EB"
          trailing={
            ownership && ownership.total > 0
              ? `${ownership.total} ${ownership.total === 1 ? 'copy' : 'copies'}`
              : undefined
          }
        >
          {ownership === null ? (
            <View style={styles.printsLoading}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : ownership.total === 0 ? (
            <Text style={styles.emptyText}>
              You don't own this card yet. Tap "Add to collection" below.
            </Text>
          ) : (
            <View style={styles.ownerList}>
              {groupByCollection(ownership.entries).map((group) => (
                <BinderGroup
                  key={group.collection_id}
                  group={group}
                  onChanged={() => setRefreshKey((k) => k + 1)}
                />
              ))}
            </View>
          )}
        </Section>

        {/* Cost basis (UI mockup, dummy data) */}
        {ownership && ownership.total > 0 && (
          <CollapsibleSection title="Cost basis" trailing="Mockup">
            <CostBasisMockup card={card} ownership={ownership} />
          </CollapsibleSection>
        )}

        {/* Other prints */}
        <Section
          title="Other prints"
          trailing={prints.length > 0 ? `${prints.length} total` : undefined}
        >
          {printsLoading ? (
            <View style={styles.printsLoading}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : prints.length === 0 ? (
            <Text style={styles.emptyText}>No other printings found.</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.printsRow}
            >
              {prints.map((p) => (
                <PrintCard
                  key={p.id}
                  card={p}
                  isCurrent={p.id === card.id}
                  ownedQty={printOwned[p.id] ?? 0}
                  setIconUri={p.set ? printSetIcons[p.set.toLowerCase()] ?? null : null}
                  onPress={() => {
                    if (p.id === card.id) return;
                    router.push({
                      pathname: '/card/[id]',
                      params: { id: p.id, cardJson: JSON.stringify(p) },
                    });
                  }}
                />
              ))}
            </ScrollView>
          )}
        </Section>

        {/* Oracle text + flavor text */}
        {(!!card.oracle_text || !!card.flavor_text) && (
          <Section title="Oracle Text">
            {!!card.oracle_text && (
              <Text style={styles.oracleText}>{card.oracle_text}</Text>
            )}
            {!!card.flavor_text && (
              <>
                <View style={styles.flavorDivider} />
                <Text style={styles.flavorText}>{card.flavor_text}</Text>
              </>
            )}
          </Section>
        )}

        {/* Double-faced back */}
        {card.card_faces && card.card_faces.length > 1 && (
          <Section title={card.card_faces[1].name}>
            {!!card.card_faces[1].type_line && (
              <Text style={styles.faceType}>{card.card_faces[1].type_line}</Text>
            )}
            {!!card.card_faces[1].oracle_text && (
              <Text style={styles.oracleText}>{card.card_faces[1].oracle_text}</Text>
            )}
            {!!card.card_faces[1].flavor_text && (
              <>
                <View style={styles.flavorDivider} />
                <Text style={styles.flavorText}>{card.card_faces[1].flavor_text}</Text>
              </>
            )}
          </Section>
        )}

        {/* Legalities (collapsible) */}
        <CollapsibleSection title="Legality">
          <View style={styles.legalGrid}>
            {LEGALITY_FORMATS.filter((f) => card.legalities?.[f.key]).map((f) => (
              <View key={f.key} style={styles.legalCol}>
                <LegalityRow label={f.label} status={card.legalities[f.key]} />
              </View>
            ))}
          </View>
        </CollapsibleSection>

        {/* Rules and Notes (collapsible, lazy fetch) */}
        <CollapsibleSection
          title="Rules and Notes"
          onExpand={() => {
            if (rulings === null) {
              fetchRulings(card.id).then(setRulings).catch(() => setRulings([]));
            }
          }}
        >
          {rulings === null ? (
            <View style={styles.printsLoading}>
              <ActivityIndicator size="small" color={colors.textMuted} />
            </View>
          ) : rulings.length === 0 ? (
            <Text style={styles.emptyText}>No rulings published.</Text>
          ) : (
            <View style={styles.rulingsList}>
              {rulings.map((r, idx) => (
                <View key={idx} style={styles.rulingItem}>
                  <Text style={styles.rulingDate}>
                    {r.published_at} · {r.source}
                  </Text>
                  <Text style={styles.rulingText}>{r.comment}</Text>
                </View>
              ))}
            </View>
          )}
        </CollapsibleSection>
      </Animated.ScrollView>

      {/* Sticky CTA */}
      <View style={[styles.ctaBar, { paddingBottom: insets.bottom + spacing.sm }]}>
        <PrimaryCTA
          icon="add"
          label="Add to collection"
          onPress={() => setShowAddSheet(true)}
          style={styles.cta}
        />
        <QuickAddButton
          ref={quickAddBtnRef}
          onPress={handleQuickAddTap}
          onLongPress={() => setShowQuickAddPicker(true)}
          accessibilityLabel="Quick add to target binder or list"
        />
      </View>

      <AddCardSheet
        visible={showAddSheet}
        card={card}
        prints={prints}
        preferredDestinationId={fromCollectionId ?? null}
        onClose={() => setShowAddSheet(false)}
        onSuccess={() => {
          setShowAddSheet(false);
          setRefreshKey((k) => k + 1);
        }}
      />

      <DestinationPickerModal
        visible={showQuickAddPicker}
        destinations={quickAddDestinations}
        selectedId={quickAddTargetId}
        onSelect={(id) => {
          setShowQuickAddPicker(false);
          handleQuickAddTargetPicked(id);
        }}
        onClose={() => setShowQuickAddPicker(false)}
      />

      {alertCount > 0 ? (
        <CardAlertsSheet
          visible={showAlertSheet}
          onClose={() => setShowAlertSheet(false)}
          card={card}
        />
      ) : (
        <CreateAlertSheet
          visible={showAlertSheet}
          onClose={() => setShowAlertSheet(false)}
          card={card}
        />
      )}
    </View>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function HeroFaceCarousel({
  card,
  fallbackUri,
}: {
  card: ScryfallCard;
  fallbackUri: string | undefined;
}) {
  const [containerWidth, setContainerWidth] = useState(
    Dimensions.get('window').width
  );

  const uris = useMemo(() => {
    const found = getFaceImages(card);
    // Always render at least two items so the carousel shape is stable
    // from the first frame. If per-face URIs haven't arrived yet (heavy
    // fields merge async), pad with fallback so the layout doesn't jump.
    const faceCount = Math.max(2, card.card_faces?.length ?? 2);
    const out: (string | undefined)[] = [];
    for (let i = 0; i < faceCount; i++) {
      out.push(found[i] ?? fallbackUri);
    }
    return out;
  }, [card, fallbackUri]);

  const sidePadding = Math.max(16, (containerWidth - HERO_IMAGE_WIDTH) / 2);

  return (
    <View
      style={styles.hero}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <FlatList
        data={uris}
        keyExtractor={(_, i) => `face-${i}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={HERO_IMAGE_WIDTH + HERO_FACE_GAP}
        snapToAlignment="start"
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: sidePadding }}
        ItemSeparatorComponent={() => <View style={{ width: HERO_FACE_GAP }} />}
        renderItem={({ item }) => (
          <View style={styles.heroFaceItem}>
            <View style={styles.heroImageWrap}>
              {item ? (
                <Image
                  source={{ uri: item }}
                  style={styles.heroImage}
                  contentFit="contain"
                  transition={200}
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.heroImage, styles.heroImagePlaceholder]} />
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

function Header({
  title,
  owned,
  ownedReady,
  titleStyle,
  onBack,
  alertCount,
  onOpenAlert,
}: {
  title: string;
  owned: number;
  ownedReady: boolean;
  titleStyle: ReturnType<typeof useAnimatedStyle>;
  onBack: () => void;
  alertCount: number;
  onOpenAlert: () => void;
}) {
  // Render the subtitle slot unconditionally so the header's vertical
  // rhythm stays the same whether the user owns zero or ten copies.
  // '\u00A0' (nbsp) keeps the line height reserved while invisible.
  let subtitleText = '\u00A0';
  if (ownedReady && owned > 0) subtitleText = `${owned} owned`;
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.headerBtn} onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </TouchableOpacity>
      <Animated.View style={[styles.headerTitleWrap, titleStyle]}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitleText}</Text>
      </Animated.View>
      <TouchableOpacity
        style={styles.headerBtn}
        onPress={onOpenAlert}
        hitSlop={8}
        accessibilityLabel={
          alertCount > 0 ? `${alertCount} active price alert${alertCount === 1 ? '' : 's'}` : 'Create price alert'
        }
      >
        <Ionicons
          name={alertCount > 0 ? 'notifications' : 'notifications-outline'}
          size={22}
          color={colors.text}
        />
        {alertCount > 0 && (
          <View style={styles.headerBtnBadge}>
            <Text style={styles.headerBtnBadgeText}>{alertCount}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function Section({
  title,
  trailing,
  accent,
  children,
}: {
  title?: string;
  trailing?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      {!!title && (
        <View
          style={[
            styles.sectionHeader,
            accent ? { backgroundColor: accent } : null,
          ]}
        >
          <Text
            style={[
              styles.sectionTitle,
              accent && { color: '#4B5563', fontWeight: '600', fontSize: fontSize.md },
            ]}
          >
            {title}
          </Text>
          {!!trailing && (
            <Text
              style={[
                styles.sectionTrailing,
                accent && { color: '#4B5563', opacity: 0.65, fontSize: fontSize.sm },
              ]}
            >
              {trailing}
            </Text>
          )}
        </View>
      )}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function CollapsibleSection({
  title,
  trailing,
  children,
  onExpand,
}: {
  title: string;
  trailing?: string;
  children: React.ReactNode;
  onExpand?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.collapseHeader}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          if (!open) onExpand?.();
          setOpen((v) => !v);
        }}
        activeOpacity={0.6}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.collapseHeaderRight}>
          {!!trailing && <Text style={styles.sectionTrailing}>{trailing}</Text>}
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        </View>
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function MetaPill({
  label,
  color,
  icon,
  dot,
  onPress,
}: {
  label: string;
  color?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  dot?: boolean;
  /** When provided the pill becomes tappable (touch feedback enabled). */
  onPress?: () => void;
}) {
  // Tappable pills look identical to static ones — the tap is an
  // easter-egg shortcut, not a primary affordance. Users who tap the
  // artist pill get the search; everyone else just reads the label.
  const Container: any = onPress ? TouchableOpacity : View;
  const containerProps = onPress ? { activeOpacity: 0.6, onPress } : {};
  return (
    <Container style={styles.metaPill} {...containerProps}>
      {icon && (
        <Ionicons name={icon} size={12} color={colors.textMuted} style={{ marginRight: 4 }} />
      )}
      {dot && (
        <View
          style={[
            styles.rarityDot,
            { backgroundColor: color ?? colors.textSecondary },
          ]}
        />
      )}
      <Text
        style={[
          styles.metaPillText,
          color && !dot ? { color } : null,
          dot ? { textTransform: 'capitalize' } : null,
        ]}
      >
        {label}
      </Text>
    </Container>
  );
}

function PriceCell({
  label,
  value,
  available,
}: {
  label: string;
  value: number | null;
  available: boolean;
}) {
  return (
    <View style={styles.priceCell}>
      <Text style={styles.priceLabel}>{label}</Text>
      <Text style={[styles.priceValue, !available && styles.priceValueMuted]}>
        {available ? formatUSD(value) : '—'}
      </Text>
    </View>
  );
}

function PrintCard({
  card,
  isCurrent,
  ownedQty,
  setIconUri,
  onPress,
}: {
  card: ScryfallCard;
  isCurrent: boolean;
  ownedQty: number;
  setIconUri: string | null;
  onPress: () => void;
}) {
  const img = getCardImageUri(card, 'normal');
  const price =
    priceFromCard(card, 'usd') ??
    priceFromCard(card, 'usd_foil') ??
    priceFromCard(card, 'usd_etched');
  const showOwnedBadge = ownedQty > 0 && !isCurrent;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.printCard, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.printImageWrap, isCurrent && styles.printImageActive]}>
        <Image
          source={{ uri: img }}
          style={styles.printImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
        {isCurrent && (
          <View style={styles.printCurrentBadge}>
            <Ionicons name="checkmark" size={12} color="#FFFFFF" />
          </View>
        )}
        {showOwnedBadge && (
          <View style={styles.printOwnedBadge}>
            <Text style={styles.printOwnedBadgeText}>×{ownedQty}</Text>
          </View>
        )}
      </View>
      <View style={styles.printSetRow}>
        {!!setIconUri && (
          <Image
            source={{ uri: setIconUri }}
            style={styles.printSetIcon}
            contentFit="contain"
            tintColor={colors.text}
          />
        )}
        <Text style={styles.printSet} numberOfLines={1}>
          {(card.set ?? '').toUpperCase()} · #{card.collector_number}
        </Text>
      </View>
      {price != null && (
        <Text style={styles.printPrice}>{formatUSD(price)}</Text>
      )}
    </Pressable>
  );
}

type BinderGroupData = {
  collection_id: string;
  collection_name: string;
  collection_type: 'binder' | 'list';
  collection_color: string | null;
  entries: OwnershipEntry[];
};

const CONDITION_ORDER: Record<Condition, number> = {
  NM: 0, LP: 1, MP: 2, HP: 3, DMG: 4,
};

const FINISH_ORDER: Finish[] = ['normal', 'foil', 'etched'];
const FINISH_LABEL: Record<Finish, string> = {
  normal: 'Normal',
  foil: 'Foil',
  etched: 'Etched Foil',
};

function groupByCollection(entries: OwnershipEntry[]): BinderGroupData[] {
  const map = new Map<string, BinderGroupData>();
  for (const e of entries) {
    if (!map.has(e.collection_id)) {
      map.set(e.collection_id, {
        collection_id: e.collection_id,
        collection_name: e.collection_name,
        collection_type: e.collection_type,
        collection_color: e.collection_color,
        entries: [],
      });
    }
    map.get(e.collection_id)!.entries.push(e);
  }
  for (const g of map.values()) {
    g.entries.sort((a, b) => CONDITION_ORDER[a.condition] - CONDITION_ORDER[b.condition]);
  }
  return Array.from(map.values());
}

function BinderGroup({
  group,
  onChanged,
}: {
  group: BinderGroupData;
  onChanged: () => void;
}) {
  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    group.collection_type === 'binder' ? 'albums' : 'list';

  return (
    <View style={styles.binderGroup}>
      <View style={styles.binderHeader}>
        <Ionicons
          name={icon}
          size={18}
          color={group.collection_color ?? colors.textSecondary}
        />
        <Text style={styles.binderName} numberOfLines={1}>
          {group.collection_name}
        </Text>
      </View>

      {group.entries.map((entry) => (
        <ConditionBlock key={entry.id} entry={entry} onChanged={onChanged} />
      ))}
    </View>
  );
}

function ConditionBlock({
  entry,
  onChanged,
}: {
  entry: OwnershipEntry;
  onChanged: () => void;
}) {
  const conditionLabel =
    CONDITIONS.find((c) => c.value === entry.condition)?.label ?? entry.condition;

  const finishesWithQty = FINISH_ORDER.filter((f) => {
    if (f === 'normal') return entry.quantity_normal > 0;
    if (f === 'foil') return entry.quantity_foil > 0;
    return entry.quantity_etched > 0;
  });

  if (finishesWithQty.length === 0) return null;

  return (
    <View style={styles.conditionBlock}>
      <Text style={styles.conditionLabel}>{conditionLabel}</Text>
      <View style={styles.finishList}>
        {finishesWithQty.map((finish) => (
          <FinishStepper
            key={finish}
            entry={entry}
            finish={finish}
            qty={
              finish === 'normal'
                ? entry.quantity_normal
                : finish === 'foil'
                ? entry.quantity_foil
                : entry.quantity_etched
            }
            onChanged={onChanged}
          />
        ))}
      </View>
    </View>
  );
}

function FinishStepper({
  entry,
  finish,
  qty,
  onChanged,
}: {
  entry: OwnershipEntry;
  finish: Finish;
  qty: number;
  onChanged: () => void;
}) {
  // Optimistic UI with a "target" model:
  //   - `localQty` is what we show. It updates immediately on every tap
  //     to whatever the user is aiming at.
  //   - `pendingCount` tracks how many writes are in flight.
  //   - `qty` (the prop) reflects what the useQuery currently sees from
  //     local SQLite after each write lands. We only resync `localQty`
  //     back to `qty` when `pendingCount === 0` — otherwise a spam of
  //     +/- taps would visibly bounce through every intermediate qty
  //     value as each write settles.
  //   - `qtyRef` keeps the freshest `qty` readable from inside async
  //     callbacks whose closure would otherwise see a stale value.
  const [localQty, setLocalQty] = useState(qty);
  const pendingCountRef = useRef(0);
  const qtyRef = useRef(qty);

  useEffect(() => {
    qtyRef.current = qty;
    if (pendingCountRef.current === 0) {
      setLocalQty(qty);
    }
  }, [qty]);

  function bump(delta: number) {
    // Use the updater form so rapid-fire taps compose against the
    // latest local value (not the closure captured when this bump was
    // created). Without this, two taps in the same React batch both
    // see the same `localQty` and second tap is effectively dropped.
    setLocalQty((prev) => Math.max(0, prev + delta));
    pendingCountRef.current += 1;

    adjustOwnershipQuantityLocal(entry.id, finish, delta)
      .then(() => onChanged())
      .catch(() => {
        // On failure, snap back to authoritative value.
        setLocalQty(qtyRef.current);
      })
      .finally(() => {
        // Just decrement the in-flight counter. Resync is handled
        // exclusively by the useEffect on [qty] — touching localQty
        // here races with the useQuery propagation and makes the
        // display bounce through stale values.
        pendingCountRef.current -= 1;
      });
  }

  return (
    <View style={styles.finishRow}>
      <Text style={styles.finishLabel}>{FINISH_LABEL[finish]}</Text>
      <View style={styles.stepperGroup}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => bump(-1)}
          hitSlop={6}
        >
          <Ionicons name="remove" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.stepperQty}>{localQty}</Text>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => bump(1)}
          hitSlop={6}
        >
          <Ionicons name="add" size={18} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// Cost basis (UI mockup with dummy data)
// ============================================================

type CostRow = {
  collection_name: string;
  collection_color: string | null;
  collection_type: 'binder' | 'list';
  conditionLabel: string;
  finishLabel: string;
  qty: number;
  bought: number;
  now: number;
  source: 'user' | 'snapshot';
};

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function buildDummyCostRows(card: ScryfallCard, ownership: OwnershipSummary): CostRow[] {
  const rows: CostRow[] = [];
  const marketByFinish = (f: Finish): number => {
    const raw =
      f === 'normal' ? card.prices?.usd
      : f === 'foil' ? card.prices?.usd_foil
      : card.prices?.usd_etched;
    return raw ? parseFloat(raw) : 1.0; // fallback for dummy
  };

  for (const e of ownership.entries) {
    const conditionLabel = CONDITIONS.find((c) => c.value === e.condition)?.label ?? e.condition;
    const triples: { finish: Finish; qty: number }[] = [];
    if (e.quantity_normal > 0) triples.push({ finish: 'normal', qty: e.quantity_normal });
    if (e.quantity_foil > 0) triples.push({ finish: 'foil', qty: e.quantity_foil });
    if (e.quantity_etched > 0) triples.push({ finish: 'etched', qty: e.quantity_etched });

    for (const { finish, qty } of triples) {
      const seed = hash(`${e.id}-${finish}`);
      const now = marketByFinish(finish);
      // Dummy bought: 60% – 130% of current market, deterministic
      const factor = 0.6 + ((seed % 70) / 100);
      const bought = Math.max(0.05, +(now * factor).toFixed(2));
      const source: 'user' | 'snapshot' = seed % 2 === 0 ? 'user' : 'snapshot';

      rows.push({
        collection_name: e.collection_name,
        collection_color: e.collection_color,
        collection_type: e.collection_type,
        conditionLabel,
        finishLabel: FINISH_LABEL[finish],
        qty,
        bought,
        now,
        source,
      });
    }
  }
  return rows;
}

function CostBasisMockup({ card, ownership }: { card: ScryfallCard; ownership: OwnershipSummary }) {
  const rows = buildDummyCostRows(card, ownership);

  let totalCost = 0;
  let totalNow = 0;
  for (const r of rows) {
    totalCost += r.bought * r.qty;
    totalNow += r.now * r.qty;
  }
  const delta = totalNow - totalCost;
  const pct = totalCost > 0 ? (delta / totalCost) * 100 : 0;
  const up = delta >= 0;

  return (
    <View style={styles.costContainer}>
      {/* Summary */}
      <View style={styles.costSummary}>
        <View style={styles.costSummaryRow}>
          <Text style={styles.costSummaryLabel}>Total cost</Text>
          <Text style={styles.costSummaryValue}>{formatUSD(totalCost)}</Text>
        </View>
        <View style={styles.costSummaryRow}>
          <Text style={styles.costSummaryLabel}>Current value</Text>
          <Text style={styles.costSummaryValue}>{formatUSD(totalNow)}</Text>
        </View>
        <View style={styles.costSummaryDivider} />
        <View style={styles.costSummaryRow}>
          <Text style={styles.costSummaryLabel}>Profit / Loss</Text>
          <View style={styles.costDeltaWrap}>
            <Ionicons
              name={up ? 'arrow-up' : 'arrow-down'}
              size={14}
              color={up ? '#16A34A' : '#DC2626'}
            />
            <Text style={[styles.costDeltaText, { color: up ? '#16A34A' : '#DC2626' }]}>
              {up ? '+' : ''}{formatUSD(delta)} ({up ? '+' : ''}{pct.toFixed(1)}%)
            </Text>
          </View>
        </View>
      </View>

      {/* Rows */}
      <View style={styles.costRows}>
        {rows.map((r, idx) => (
          <CostRowItem key={idx} row={r} />
        ))}
      </View>
    </View>
  );
}

function CostRowItem({ row }: { row: CostRow }) {
  const totalBought = row.bought * row.qty;
  const totalNow = row.now * row.qty;
  const delta = totalNow - totalBought;
  const pct = totalBought > 0 ? (delta / totalBought) * 100 : 0;
  const up = delta >= 0;

  const icon: React.ComponentProps<typeof Ionicons>['name'] =
    row.collection_type === 'binder' ? 'albums' : 'list';

  return (
    <View style={styles.costRow}>
      <View style={styles.costRowHeader}>
        <Ionicons name={icon} size={14} color={row.collection_color ?? colors.textSecondary} />
        <Text style={styles.costRowBinder} numberOfLines={1}>{row.collection_name}</Text>
        <SourceTag source={row.source} />
      </View>
      <View style={styles.costRowMeta}>
        <Text style={styles.costRowMetaText}>
          {row.conditionLabel} · {row.finishLabel}{row.qty > 1 ? `  ×${row.qty}` : ''}
        </Text>
      </View>
      <View style={styles.costRowFooter}>
        <Text style={styles.costPriceText}>
          <Text style={styles.costPriceMuted}>{formatUSD(row.bought)}</Text>
          <Text style={styles.costPriceArrow}>  →  </Text>
          <Text style={styles.costPriceNow}>{formatUSD(row.now)}</Text>
        </Text>
        <View style={styles.costDeltaWrap}>
          <Ionicons
            name={up ? 'caret-up' : 'caret-down'}
            size={11}
            color={up ? '#16A34A' : '#DC2626'}
          />
          <Text style={[styles.costRowDelta, { color: up ? '#16A34A' : '#DC2626' }]}>
            {up ? '+' : ''}{formatUSD(delta)} ({up ? '+' : ''}{pct.toFixed(0)}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

function SourceTag({ source }: { source: 'user' | 'snapshot' }) {
  const isUser = source === 'user';
  return (
    <View
      style={[
        styles.sourceTag,
        { backgroundColor: isUser ? '#E0E7FF' : '#F3F4F6' },
      ]}
    >
      <Text style={[styles.sourceTagText, { color: isUser ? '#3730A3' : '#6B7280' }]}>
        {isUser ? 'YOU' : 'SNAP'}
      </Text>
    </View>
  );
}

function LegalityRow({ label, status }: { label: string; status: string }) {
  const isLegal = status === 'legal';
  const isRestricted = status === 'restricted';
  const isBanned = status === 'banned';

  let bg: string = '#C0C0C0';
  let text = 'NOT LEGAL';
  if (isLegal) { bg = '#7FA77F'; text = 'LEGAL'; }
  else if (isRestricted) { bg = '#D9A24E'; text = 'RESTRICTED'; }
  else if (isBanned) { bg = '#C66363'; text = 'BANNED'; }

  return (
    <View style={styles.legalRow}>
      <View style={[styles.legalBadge, { backgroundColor: bg }]}>
        <Text style={styles.legalBadgeText}>{text}</Text>
      </View>
      <Text style={styles.legalLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    overflow: 'hidden',
  },
  headerBlur: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: 100,
  },
  scroll: {
    paddingBottom: spacing.xxl,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    // Transparent so the blur layer beneath shows through. Back + alert
    // icons stay visible regardless because they paint over the header.
    backgroundColor: 'transparent',
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  headerBtnBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  // Hero (+30%)
  hero: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  heroImageWrap: {
    borderRadius: borderRadius.lg,
    ...shadows.lg,
  },
  heroImage: {
    width: HERO_IMAGE_WIDTH,
    height: HERO_IMAGE_HEIGHT,
    borderRadius: borderRadius.lg,
  },
  heroImagePlaceholder: {
    backgroundColor: colors.surfaceSecondary,
  },
  heroFaceItem: {
    width: HERO_IMAGE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  sectionTrailing: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  sectionBody: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: 0,
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  collapseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },

  // Identity
  nameRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  manaCost: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontFamily: 'Menlo',
    fontWeight: '600',
    paddingTop: 4,
  },
  typeLine: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: 4,
  },

  // Set line
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.md,
  },
  setIcon: {
    width: 18,
    height: 18,
  },
  setName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
    flexShrink: 1,
  },
  setCode: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
    marginTop: spacing.sm,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  metaPillText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  rarityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },

  // Pricing
  priceGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: spacing.xs,
  },
  priceCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  priceCellDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  priceLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  priceValue: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginTop: 6,
  },
  priceValueMuted: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  priceUnavailable: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },

  // Prints (+20%)
  printsRow: {
    paddingTop: spacing.xs,
    gap: spacing.md,
    paddingRight: spacing.lg,
  },
  printsLoading: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  printCard: {
    width: 121,
  },
  printImageWrap: {
    width: 121,
    height: 169,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  printImageActive: {
    borderColor: colors.textSecondary,
  },
  printImage: {
    width: '100%',
    height: '100%',
  },
  printCurrentBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.textSecondary,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printOwnedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 9,
    minWidth: 22,
    alignItems: 'center',
  },
  printOwnedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  printSetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  printSetIcon: {
    width: 12,
    height: 12,
  },
  printSet: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '600',
    flexShrink: 1,
  },
  printPrice: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },

  // Ownership
  ownerList: {
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  binderGroup: {
    gap: spacing.sm,
  },
  binderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  binderName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    flex: 1,
  },
  conditionBlock: {
    paddingLeft: spacing.sm,
    gap: 4,
  },
  conditionLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 2,
  },
  finishList: {
    gap: 2,
  },
  finishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.md,
    paddingVertical: 4,
  },
  finishLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    flex: 1,
  },
  stepperGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.full,
  },
  stepBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    minWidth: 24,
    textAlign: 'center',
  },

  // Cost basis (mockup)
  costContainer: {
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  costSummary: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    gap: 6,
  },
  costSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  costSummaryLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  costSummaryValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  costSummaryDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  costDeltaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  costDeltaText: {
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  costRows: {
    gap: spacing.sm,
  },
  costRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: 4,
  },
  costRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  costRowBinder: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  costRowMeta: {
    paddingLeft: 20,
  },
  costRowMetaText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  costRowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    marginTop: 2,
  },
  costPriceText: {
    fontSize: fontSize.sm,
  },
  costPriceMuted: {
    color: colors.textMuted,
    fontWeight: '500',
    textDecorationLine: 'line-through',
  },
  costPriceArrow: {
    color: colors.textMuted,
  },
  costPriceNow: {
    color: colors.text,
    fontWeight: '700',
  },
  costRowDelta: {
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  sourceTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sourceTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // Legality (2-column grid, badge-left)
  legalGrid: {
    paddingTop: spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  legalCol: {
    width: '50%',
    paddingRight: spacing.sm,
  },
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legalLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '500',
    flexShrink: 1,
  },
  legalBadge: {
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
    width: 72,
    alignItems: 'center',
  },
  legalBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Rules and Notes
  rulingsList: {
    paddingTop: spacing.xs,
    gap: spacing.md,
  },
  rulingItem: {
    paddingVertical: 4,
  },
  rulingDate: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  rulingText: {
    color: colors.text,
    fontSize: fontSize.md,
    lineHeight: 22,
  },

  // Oracle + Flavor
  oracleText: {
    color: colors.text,
    fontSize: fontSize.lg,
    lineHeight: 26,
    paddingTop: spacing.xs,
  },
  flavorDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  flavorText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  faceType: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },

  // Sticky CTA
  ctaBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  cta: {
    flex: 1,
    minHeight: 44,
    ...shadows.md,
  },
});
