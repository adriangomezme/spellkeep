import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { ScryfallCard } from '../../lib/scryfall';
import { matchCard, validateMTGLayout } from '../../lib/card-matcher';
import { addToCollection, Condition, Finish } from '../../lib/collection';

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
  condition: Condition;
  finish: Finish;
  availableFinishes: Finish[];
  quantity: number;
};

/**
 * Determines which finishes are available based on Scryfall price data.
 */
function getAvailableFinishes(card: ScryfallCard): Finish[] {
  const finishes: Finish[] = [];
  if (card.prices?.usd !== undefined && card.prices.usd !== null) finishes.push('normal');
  if (card.prices?.usd_foil !== undefined && card.prices.usd_foil !== null) finishes.push('foil');
  // Etched foil check — Scryfall uses 'usd_etched' but our type only has usd/usd_foil
  // For now, etched is available if the card's finishes include it (check layout or name)
  if (finishes.length === 0) finishes.push('normal'); // fallback
  return finishes;
}

/**
 * Gets the price for a specific finish.
 */
export function getPriceForFinish(card: ScryfallCard, finish: Finish): string | undefined {
  if (finish === 'foil') return card.prices?.usd_foil;
  return card.prices?.usd;
}

let trayIdCounter = 0;

export function useScanState() {
  const [detection, setDetection] = useState<DetectionState>({
    status: 'scanning',
    card: null,
    candidates: [],
    condition: 'NM',
    finish: 'normal',
    availableFinishes: ['normal'],
    quantity: 1,
  });

  const [trayItems, setTrayItems] = useState<ScanTrayItem[]>([]);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isProcessingRef = useRef(false);
  const lastMatchedNameRef = useRef('');

  // ── Detection ──────────────────────────────────────────

  const handleOCRText = useCallback((text: string) => {
    if (isProcessingRef.current) return;
    if (detection.status !== 'scanning') return;

    const validation = validateMTGLayout(text);
    if (!validation.isCard || !validation.regions.name) return;

    if (validation.regions.name === lastMatchedNameRef.current) return;

    isProcessingRef.current = true;
    setDetection((prev) => ({ ...prev, status: 'searching' }));

    matchCard(text)
      .then((matches) => {
        if (matches.length > 0) {
          const card = matches[0];
          const available = getAvailableFinishes(card);
          lastMatchedNameRef.current = card.name;
          setDetection({
            status: 'detected',
            card,
            candidates: matches,
            condition: 'NM',
            finish: available[0],
            availableFinishes: available,
            quantity: 1,
          });
        } else {
          setDetection((prev) => ({ ...prev, status: 'no_match' }));
          setTimeout(() => {
            setDetection((prev) =>
              prev.status === 'no_match' ? { ...prev, status: 'scanning' } : prev
            );
          }, 2000);
        }
      })
      .catch(() => {
        setDetection((prev) => ({ ...prev, status: 'scanning' }));
      })
      .finally(() => {
        isProcessingRef.current = false;
      });
  }, [detection.status]);

  const selectCandidate = useCallback((card: ScryfallCard) => {
    const available = getAvailableFinishes(card);
    setDetection((prev) => ({
      ...prev,
      card,
      finish: available[0],
      availableFinishes: available,
    }));
  }, []);

  const setDetectionCondition = useCallback((condition: Condition) => {
    setDetection((prev) => ({ ...prev, condition }));
  }, []);

  /** Cycle to next available finish */
  const cycleFinish = useCallback(() => {
    setDetection((prev) => {
      const idx = prev.availableFinishes.indexOf(prev.finish);
      const next = prev.availableFinishes[(idx + 1) % prev.availableFinishes.length];
      return { ...prev, finish: next };
    });
  }, []);

  /** Tap: +1 quantity. Long press: reset to 1. */
  const incrementQuantity = useCallback(() => {
    setDetection((prev) => ({ ...prev, quantity: prev.quantity + 1 }));
  }, []);

  const resetQuantity = useCallback(() => {
    setDetection((prev) => ({ ...prev, quantity: 1 }));
  }, []);

  const confirmDetection = useCallback(() => {
    if (!detection.card) return;

    const { card, condition, finish, quantity } = detection;

    setTrayItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.card.id === card.id && item.condition === condition && item.finish === finish
      );

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }

      return [
        {
          id: `tray-${++trayIdCounter}`,
          card,
          condition,
          finish,
          quantity,
          addedAt: Date.now(),
        },
        ...prev,
      ];
    });

    lastMatchedNameRef.current = '';
    setDetection({
      status: 'scanning',
      card: null,
      candidates: [],
      condition: 'NM',
      finish: 'normal',
      availableFinishes: ['normal'],
      quantity: 1,
    });
  }, [detection]);

  const dismissDetection = useCallback(() => {
    lastMatchedNameRef.current = '';
    setDetection({
      status: 'scanning',
      card: null,
      candidates: [],
      condition: 'NM',
      finish: 'normal',
      availableFinishes: ['normal'],
      quantity: 1,
    });
  }, []);

  // ── Tray ───────────────────────────────────────────────

  const editTrayItem = useCallback((id: string, updates: Partial<Pick<ScanTrayItem, 'condition' | 'finish' | 'quantity'>>) => {
    setTrayItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const removeTrayItem = useCallback((id: string) => {
    setTrayItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearTray = useCallback(() => {
    Alert.alert('Clear all?', 'Remove all scanned cards from the tray?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => {
        setTrayItems([]);
        setTrayExpanded(false);
      }},
    ]);
  }, []);

  // ── Destination ────────────────────────────────────────

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
      Alert.alert('Done!', `${trayItems.length} cards added successfully`);
      setTrayItems([]);
      setTrayExpanded(false);
    } else {
      Alert.alert(
        'Partial save',
        `${trayItems.length - failures.length} of ${trayItems.length} cards saved. ${failures.length} failed.`
      );
      const failedIndices = new Set(
        results.map((r, i) => (r.status === 'rejected' ? i : -1)).filter((i) => i >= 0)
      );
      setTrayItems((prev) => prev.filter((_, i) => failedIndices.has(i)));
    }

    setIsSaving(false);
    setShowDestinationPicker(false);
  }, [trayItems]);

  return {
    detection,
    handleOCRText,
    selectCandidate,
    setDetectionCondition,
    cycleFinish,
    incrementQuantity,
    resetQuantity,
    confirmDetection,
    dismissDetection,

    trayItems,
    trayCount: trayItems.length,
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
