import { useState, useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { ScryfallCard } from '../../lib/scryfall';
import { matchCard, validateMTGLayout, extractCardName } from '../../lib/card-matcher';
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

let trayIdCounter = 0;

export function useScanState() {
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

  const [trayItems, setTrayItems] = useState<ScanTrayItem[]>([]);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [showDestinationPicker, setShowDestinationPicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const isProcessingRef = useRef(false);
  const statusRef = useRef<DetectionStatus>('scanning');
  /** The Scryfall card name of the currently detected card */
  const currentCardNameRef = useRef('');
  const trayItemIdRef = useRef<string | null>(null);

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

    const validation = validateMTGLayout(text);
    if (!validation.isCard || !validation.regions.name) return;

    // Smart duplicate prevention: compare OCR name with current card name.
    // If they look like the same card, skip the API call entirely.
    const ocrName = validation.regions.name;
    if (currentCardNameRef.current && isSameCardName(ocrName, currentCardNameRef.current)) {
      return;
    }

    isProcessingRef.current = true;
    statusRef.current = 'searching';
    setDetection((prev) => ({ ...prev, status: 'searching' }));

    matchCard(text)
      .then((matches) => {
        if (matches.length > 0) {
          const card = matches[0];

          // Double check: API result is same card as current
          if (currentCardNameRef.current && card.name === currentCardNameRef.current) {
            statusRef.current = trayItemIdRef.current ? 'detected' : 'scanning';
            setDetection((prev) => ({ ...prev, status: statusRef.current }));
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

            newTrayId = `tray-${++trayIdCounter}`;
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
      })
      .catch(() => {
        statusRef.current = 'scanning';
        setDetection((prev) => ({ ...prev, status: 'scanning' }));
      })
      .finally(() => {
        isProcessingRef.current = false;
      });
  }, []);

  // ── Preview edits ─────────────────────────────────────

  function updateCurrentTrayItem(updates: Partial<ScanTrayItem>) {
    const id = trayItemIdRef.current;
    if (!id) return;
    setTrayItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  const setDetectionCondition = useCallback((condition: Condition) => {
    setDetection((prev) => ({ ...prev, condition }));
    updateCurrentTrayItem({ condition });
  }, []);

  const cycleFinish = useCallback(() => {
    setDetection((prev) => {
      const idx = prev.availableFinishes.indexOf(prev.finish);
      const next = prev.availableFinishes[(idx + 1) % prev.availableFinishes.length];
      updateCurrentTrayItem({ finish: next });
      return { ...prev, finish: next };
    });
  }, []);

  const incrementQuantity = useCallback(() => {
    setDetection((prev) => {
      const qty = prev.quantity + 1;
      updateCurrentTrayItem({ quantity: qty });
      return { ...prev, quantity: qty };
    });
  }, []);

  const resetQuantity = useCallback(() => {
    setDetection((prev) => {
      updateCurrentTrayItem({ quantity: 1 });
      return { ...prev, quantity: 1 };
    });
  }, []);

  const changeVersion = useCallback((newCard: ScryfallCard) => {
    const available = getAvailableFinishes(newCard);
    currentCardNameRef.current = newCard.name;
    setDetection((prev) => ({
      ...prev,
      card: newCard,
      finish: available[0],
      availableFinishes: available,
    }));
    updateCurrentTrayItem({ card: newCard, finish: available[0] });
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

  const editTrayItem = useCallback((id: string, updates: Partial<Pick<ScanTrayItem, 'condition' | 'finish' | 'quantity'>>) => {
    setTrayItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
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
      setTrayItems((prev) => prev.filter((_, i) => failedIndices.has(i)));
    }

    setIsSaving(false);
    setShowDestinationPicker(false);
  }, [trayItems, dismissDetection]);

  return {
    detection,
    handleOCRText,
    setDetectionCondition,
    cycleFinish,
    incrementQuantity,
    resetQuantity,
    changeVersion,
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
