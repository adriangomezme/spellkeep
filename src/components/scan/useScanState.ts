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
  /** ID of the tray item this detection is editing */
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
  const lastMatchedNameRef = useRef('');

  // ── Detection (auto-adds to tray) ─────────────────────

  const handleOCRText = useCallback((text: string) => {
    if (isProcessingRef.current) return;
    if (detection.status === 'searching') return;

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
          const finish = available[0];
          lastMatchedNameRef.current = card.name;

          // Auto-add to tray
          const newId = `tray-${++trayIdCounter}`;
          const newItem: ScanTrayItem = {
            id: newId,
            card,
            condition: 'NM',
            finish,
            quantity: 1,
            addedAt: Date.now(),
          };

          setTrayItems((prev) => [newItem, ...prev]);

          // Show in preview (editing this tray item)
          setDetection({
            status: 'detected',
            card,
            candidates: matches,
            trayItemId: newId,
            condition: 'NM',
            finish,
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

  // ── Preview edits → update tray item ──────────────────

  /** Sync detection edits back to the tray item */
  function updateCurrentTrayItem(updates: Partial<ScanTrayItem>) {
    const id = detection.trayItemId;
    if (!id) return;
    setTrayItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }

  const setDetectionCondition = useCallback((condition: Condition) => {
    setDetection((prev) => ({ ...prev, condition }));
    updateCurrentTrayItem({ condition });
  }, [detection.trayItemId]);

  const cycleFinish = useCallback(() => {
    setDetection((prev) => {
      const idx = prev.availableFinishes.indexOf(prev.finish);
      const next = prev.availableFinishes[(idx + 1) % prev.availableFinishes.length];
      updateCurrentTrayItem({ finish: next });
      return { ...prev, finish: next };
    });
  }, [detection.trayItemId]);

  const incrementQuantity = useCallback(() => {
    setDetection((prev) => {
      const qty = prev.quantity + 1;
      updateCurrentTrayItem({ quantity: qty });
      return { ...prev, quantity: qty };
    });
  }, [detection.trayItemId]);

  const resetQuantity = useCallback(() => {
    setDetection((prev) => {
      updateCurrentTrayItem({ quantity: 1 });
      return { ...prev, quantity: 1 };
    });
  }, [detection.trayItemId]);

  /** Change the version/print of the detected card */
  const changeVersion = useCallback((newCard: ScryfallCard) => {
    const available = getAvailableFinishes(newCard);
    setDetection((prev) => ({
      ...prev,
      card: newCard,
      finish: available[0],
      availableFinishes: available,
    }));
    updateCurrentTrayItem({ card: newCard, finish: available[0] });
  }, [detection.trayItemId]);

  const dismissDetection = useCallback(() => {
    lastMatchedNameRef.current = '';
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

  // ── Tray ───────────────────────────────────────────────

  const editTrayItem = useCallback((id: string, updates: Partial<Pick<ScanTrayItem, 'condition' | 'finish' | 'quantity'>>) => {
    setTrayItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item))
    );
  }, []);

  const removeTrayItem = useCallback((id: string) => {
    setTrayItems((prev) => prev.filter((item) => item.id !== id));
    // If removing the currently previewed item, dismiss detection
    if (detection.trayItemId === id) {
      dismissDetection();
    }
  }, [detection.trayItemId, dismissDetection]);

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
