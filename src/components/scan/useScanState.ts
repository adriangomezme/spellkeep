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

let trayIdCounter = 0;

const SCAN_COOLDOWN_MS = 4000;

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

  // ALL guards use refs so handleOCRText never needs to be recreated
  const isProcessingRef = useRef(false);
  const statusRef = useRef<DetectionStatus>('scanning');
  const lastMatchedIdRef = useRef('');
  const cooldownActiveRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trayItemIdRef = useRef<string | null>(null);

  // Keep refs in sync with state
  function updateDetection(newState: DetectionState) {
    statusRef.current = newState.status;
    trayItemIdRef.current = newState.trayItemId;
    setDetection(newState);
  }

  // ── Detection ─────────────────────────────────────────
  // handleOCRText has NO dependencies — uses only refs for guards.
  // This ensures the worklet bridge always calls the same function.

  const handleOCRText = useCallback((text: string) => {
    // Guard: already processing
    if (isProcessingRef.current) return;
    // Guard: currently searching
    if (statusRef.current === 'searching') return;
    // Guard: in cooldown (just scanned a card)
    if (cooldownActiveRef.current) return;

    const validation = validateMTGLayout(text);
    if (!validation.isCard || !validation.regions.name) return;

    isProcessingRef.current = true;
    updateDetection({
      ...detection,
      status: 'searching',
    });
    statusRef.current = 'searching';

    matchCard(text)
      .then((matches) => {
        if (matches.length > 0) {
          const card = matches[0];

          // Same card as last time — skip
          if (card.id === lastMatchedIdRef.current) {
            statusRef.current = trayItemIdRef.current ? 'detected' : 'scanning';
            setDetection((prev) => ({
              ...prev,
              status: statusRef.current,
            }));
            return;
          }

          const available = getAvailableFinishes(card);
          const finish = available[0];
          lastMatchedIdRef.current = card.id;

          // Activate cooldown
          cooldownActiveRef.current = true;
          if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
          cooldownTimerRef.current = setTimeout(() => {
            cooldownActiveRef.current = false;
          }, SCAN_COOLDOWN_MS);

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
  }, []); // NO dependencies — stable function reference

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
    lastMatchedIdRef.current = newCard.id;
    setDetection((prev) => ({
      ...prev,
      card: newCard,
      finish: available[0],
      availableFinishes: available,
    }));
    updateCurrentTrayItem({ card: newCard, finish: available[0] });
  }, []);

  const dismissDetection = useCallback(() => {
    lastMatchedIdRef.current = '';
    cooldownActiveRef.current = false;
    if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
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
