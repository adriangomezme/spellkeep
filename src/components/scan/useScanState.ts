import { useState, useCallback, useRef, useEffect } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ScryfallCard } from '../../lib/scryfall';
import { matchCard, validateMTGLayout } from '../../lib/card-matcher';
import { addToCollection, Condition, Finish } from '../../lib/collection';
import { setLastUsedDestination } from '../../lib/collections';

export type ScanTrayItem = {
  id: string;
  card: ScryfallCard;
  condition: Condition;
  finish: Finish;
  quantity: number;
  addedAt: number;
};

export type DetectionStatus = 'scanning' | 'searching' | 'detected' | 'no_match';

export type DetectionState = {
  status: DetectionStatus;
  card: ScryfallCard | null;
  candidates: ScryfallCard[];
  trayItemId: string | null;
  condition: Condition;
  finish: Finish;
  availableFinishes: Finish[];
  quantity: number;
};

function getAvailableFinishes(card: ScryfallCard): Finish[] {
  const finishes: Finish[] = [];
  if (card.prices?.usd !== undefined && card.prices.usd !== null) finishes.push('normal');
  if (card.prices?.usd_foil !== undefined && card.prices.usd_foil !== null) finishes.push('foil');
  if (finishes.length === 0) finishes.push('normal');
  return finishes;
}

export function getPriceForFinish(card: ScryfallCard, finish: Finish): string | undefined {
  if (finish === 'foil') return card.prices?.usd_foil;
  return card.prices?.usd;
}

/**
 * Check if two card names are similar enough to be the same card.
 * Handles OCR variations like missing letters, extra spaces, etc.
 */
function isSameCardName(ocrName: string, knownName: string): boolean {
  const a = ocrName.toLowerCase().replace(/[^a-z]/g, '');
  const b = knownName.toLowerCase().replace(/[^a-z]/g, '');
  if (a === b) return true;
  if (a.length < 3 || b.length < 3) return false;
  // Check if one contains the other (handles partial OCR reads)
  if (a.includes(b) || b.includes(a)) return true;
  // Check first N characters match (handles trailing OCR noise)
  const checkLen = Math.min(a.length, b.length, 8);
  return a.substring(0, checkLen) === b.substring(0, checkLen);
}

export function useScanState() {
  const trayIdCounterRef = useRef(0);
  const [detection, setDetection] = useState<DetectionState>({
    status: 'scanning',
    card: null,
    candidates: [],
    trayItemId: null,
    condition: 'NM',
    finish: 'normal',
    availableFinishes: ['normal'],
    quantity: 1,
  });

  const [trayItems, setTrayItemsRaw] = useState<ScanTrayItem[]>([]);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const trayLoadedRef = useRef(false);
  const [successCount, setSuccessCount] = useState(0);

  const TRAY_STORAGE_KEY = 'spellkeep_scan_tray';

  // Wrap setTrayItems to persist on every change
  function setTrayItems(updater: ScanTrayItem[] | ((prev: ScanTrayItem[]) => ScanTrayItem[])) {
    setTrayItemsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      AsyncStorage.setItem(TRAY_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  // Load tray from storage on mount
  useEffect(() => {
    AsyncStorage.getItem(TRAY_STORAGE_KEY).then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as ScanTrayItem[];
          if (parsed.length > 0) {
            setTrayItemsRaw(parsed);
            // Restore the last card as preview
            const last = parsed[0];
            statusRef.current = 'detected';
            trayItemIdRef.current = last.id;
            currentCardNameRef.current = last.card.name;
            setDetection({
              status: 'detected',
              card: last.card,
              candidates: [],
              trayItemId: last.id,
              condition: last.condition,
              finish: last.finish,
              availableFinishes: getAvailableFinishes(last.card),
              quantity: last.quantity,
            });
          }
        } catch {}
      }
      trayLoadedRef.current = true;
    });
  }, []);

  const isProcessingRef = useRef(false);
  const statusRef = useRef<DetectionStatus>('scanning');
  const currentCardNameRef = useRef('');
  const trayItemIdRef = useRef<string | null>(null);
  /** Set by ScanCamera to pause OCR when tray/version picker is open */
  const pausedRef = useRef(false);

  // Keep a ref of the full detection state for reading in callbacks
  const detectionRef = useRef(detection);
  detectionRef.current = detection;

  function updateDetection(newState: DetectionState) {
    statusRef.current = newState.status;
    trayItemIdRef.current = newState.trayItemId;
    if (newState.card) {
      currentCardNameRef.current = newState.card.name;
    }
    setDetection(newState);
  }

  // ── Detection ─────────────────────────────────────────
  // ZERO dependencies — stable function reference for worklet bridge.

  const handleOCRText = useCallback((text: string) => {
    if (isProcessingRef.current) return;
    if (statusRef.current === 'searching') return;
    if (pausedRef.current) return;

    const validation = validateMTGLayout(text);
    if (!validation.isCard || !validation.regions.name) return;

    // Smart duplicate prevention: compare OCR name with current card name.
    // If they look like the same card, skip the API call entirely.
    const ocrName = validation.regions.name;
    if (currentCardNameRef.current && isSameCardName(ocrName, currentCardNameRef.current)) {
      return;
    }

    isProcessingRef.current = true;
    const hadPreviousCard = !!trayItemIdRef.current;
    // Only show 'searching' overlay if no card is in preview yet
    if (!hadPreviousCard) {
      statusRef.current = 'searching';
      setDetection((prev) => ({ ...prev, status: 'searching' }));
    }

    matchCard(text)
      .then((matches) => {
        if (matches.length > 0) {
          const card = matches[0];

          // Same card as currently showing — skip
          if (currentCardNameRef.current && card.name === currentCardNameRef.current) {
            if (!hadPreviousCard) {
              statusRef.current = 'scanning';
              setDetection((prev) => ({ ...prev, status: 'scanning' }));
            }
            return;
          }

          const available = getAvailableFinishes(card);
          const finish = available[0];

          // Add to tray (or increment if duplicate)
          let newTrayId = '';
          setTrayItems((prev) => {
            const existingIndex = prev.findIndex((item) => item.card.id === card.id);

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                quantity: updated[existingIndex].quantity + 1,
              };
              newTrayId = updated[existingIndex].id;
              return updated;
            }

            newTrayId = `tray-${++trayIdCounterRef.current}`;
            return [
              {
                id: newTrayId,
                card,
                condition: 'NM' as Condition,
                finish,
                quantity: 1,
                addedAt: Date.now(),
              },
              ...prev,
            ];
          });

          const newState: DetectionState = {
            status: 'detected',
            card,
            candidates: matches,
            trayItemId: newTrayId,
            condition: 'NM',
            finish,
            availableFinishes: available,
            quantity: 1,
          };
          updateDetection(newState);
          setSuccessCount((c) => c + 1);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          // If we already have a card in preview, keep showing it
          if (hadPreviousCard) {
            // silently ignore the failed match
          } else {
            statusRef.current = 'no_match';
            setDetection((prev) => ({ ...prev, status: 'no_match' }));
            setTimeout(() => {
              if (statusRef.current === 'no_match') {
                statusRef.current = 'scanning';
                setDetection((prev) => ({ ...prev, status: 'scanning' }));
              }
            }, 2000);
          }
        }
      })
      .catch(() => {
        if (!hadPreviousCard) {
          statusRef.current = 'scanning';
          setDetection((prev) => ({ ...prev, status: 'scanning' }));
        }
      })
      .finally(() => {
        isProcessingRef.current = false;
      });
  }, []);

  // ── Unified edit: always updates BOTH tray item AND preview ──
  // Stored as a ref so useCallbacks always call the latest version.

  const updateItemRef = useRef((id: string, updates: Partial<ScanTrayItem>) => {});
  updateItemRef.current = (id: string, updates: Partial<ScanTrayItem>) => {
    // 1. Update tray
    setTrayItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );

    // 2. Update preview if this is the previewed item
    if (trayItemIdRef.current === id) {
      const newCard = updates.card;
      const newAvailable = newCard ? getAvailableFinishes(newCard) : undefined;

      setDetection((prev) => {
        const merged: Partial<DetectionState> = {};
        if (newCard) {
          merged.card = newCard;
          merged.availableFinishes = newAvailable;
          currentCardNameRef.current = newCard.name;
        }
        if (updates.condition) merged.condition = updates.condition;
        if (updates.finish) merged.finish = updates.finish;
        else if (newAvailable) merged.finish = newAvailable[0];
        if (updates.quantity !== undefined) merged.quantity = updates.quantity;
        return { ...prev, ...merged };
      });
    }
  };

  // Preview controls — all route through updateItemRef.current
  const setDetectionCondition = useCallback((condition: Condition) => {
    const id = trayItemIdRef.current;
    if (id) updateItemRef.current(id, { condition });
    else setDetection((prev) => ({ ...prev, condition }));
  }, []);

  const cycleFinish = useCallback(() => {
    const cur = detectionRef.current;
    const idx = cur.availableFinishes.indexOf(cur.finish);
    const next = cur.availableFinishes[(idx + 1) % cur.availableFinishes.length];
    const id = trayItemIdRef.current;
    if (id) updateItemRef.current(id, { finish: next });
    else setDetection((prev) => ({ ...prev, finish: next }));
  }, []);

  const incrementQuantity = useCallback(() => {
    const qty = detectionRef.current.quantity + 1;
    const id = trayItemIdRef.current;
    if (id) updateItemRef.current(id, { quantity: qty });
    else setDetection((prev) => ({ ...prev, quantity: qty }));
  }, []);

  const resetQuantity = useCallback(() => {
    const id = trayItemIdRef.current;
    if (id) updateItemRef.current(id, { quantity: 1 });
    else setDetection((prev) => ({ ...prev, quantity: 1 }));
  }, []);

  const changeVersion = useCallback((newCard: ScryfallCard) => {
    const id = trayItemIdRef.current;
    const available = getAvailableFinishes(newCard);
    if (id) updateItemRef.current(id, { card: newCard, finish: available[0] });
    else {
      currentCardNameRef.current = newCard.name;
      setDetection((prev) => ({ ...prev, card: newCard, finish: available[0], availableFinishes: available }));
    }
  }, []);

  const dismissDetection = useCallback(() => {
    currentCardNameRef.current = '';
    statusRef.current = 'scanning';
    trayItemIdRef.current = null;
    setDetection({
      status: 'scanning',
      card: null,
      candidates: [],
      trayItemId: null,
      condition: 'NM',
      finish: 'normal',
      availableFinishes: ['normal'],
      quantity: 1,
    });
  }, []);

  // ── Tray ──────────────────────────────────────────────

  // editTrayItem uses the same updateItem for consistency
  const editTrayItem = useCallback((id: string, updates: Partial<ScanTrayItem>) => {
    updateItemRef.current(id, updates);
  }, []);

  const removeTrayItem = useCallback((id: string) => {
    setTrayItems((prev) => prev.filter((item) => item.id !== id));
    if (trayItemIdRef.current === id) {
      dismissDetection();
    }
  }, [dismissDetection]);

  const clearTray = useCallback(() => {
    Alert.alert('Clear all?', 'Remove all scanned cards from the tray?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setTrayItems([]);
        setTrayExpanded(false);
        dismissDetection();
      }},
    ]);
  }, [dismissDetection]);

  // ── Destination ───────────────────────────────────────

  const addAllToDestination = useCallback(async (collectionId: string) => {
    if (trayItems.length === 0) return;

    setIsSaving(true);

    const results = await Promise.allSettled(
      trayItems.map((item) =>
        addToCollection(item.card, item.condition, item.finish, item.quantity, collectionId)
      )
    );

    const failures = results.filter((r) => r.status === 'rejected');

    if (failures.length === 0) {
      await setLastUsedDestination(collectionId);
      Alert.alert('Done!', `${trayItems.length} cards added successfully`);
      setTrayItems([]);
      setTrayExpanded(false);
      dismissDetection();
    } else {
      Alert.alert(
        'Partial save',
        `${trayItems.length - failures.length} of ${trayItems.length} cards saved. ${failures.length} failed.`
      );
      const failedIndices = new Set(
        results.map((r, i) => (r.status === 'rejected' ? i : -1)).filter((i) => i >= 0)
      );
      setTrayItems((prev) => prev.filter((_, i) => !failedIndices.has(i)));
    }

    setIsSaving(false);
    setShowDestinationPicker(false);
  }, [trayItems, dismissDetection]);

  return {
    detection,
    successCount,
    pausedRef,
    handleOCRText,
    setDetectionCondition,
    cycleFinish,
    incrementQuantity,
    resetQuantity,
    changeVersion,
    dismissDetection,

    trayItems,
    trayCount: trayItems.reduce((sum, item) => sum + item.quantity, 0),
    trayExpanded,
    setTrayExpanded,
    editTrayItem,
    removeTrayItem,
    clearTray,

    showDestinationPicker,
    openDestinationPicker: () => setShowDestinationPicker(true),
    closeDestinationPicker: () => setShowDestinationPicker(false),
    addAllToDestination,
    isSaving,
  };
}
