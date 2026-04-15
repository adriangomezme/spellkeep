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
  quantity: number;
};

let trayIdCounter = 0;

export function useScanState() {
  const [detection, setDetection] = useState<DetectionState>({
    status: 'scanning',
    card: null,
    candidates: [],
    condition: 'NM',
    quantity: 1,
  });

  const [trayItems, setTrayItems] = useState<ScanTrayItem[]>([]);
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

    // Don't re-process the same card
    if (validation.regions.name === lastMatchedNameRef.current) return;

    isProcessingRef.current = true;
    setDetection((prev) => ({ ...prev, status: 'searching' }));

    matchCard(text)
      .then((matches) => {
        if (matches.length > 0) {
          lastMatchedNameRef.current = matches[0].name;
          setDetection({
            status: 'detected',
            card: matches[0],
            candidates: matches,
            condition: 'NM',
            quantity: 1,
          });
        } else {
          setDetection((prev) => ({ ...prev, status: 'no_match' }));
          // Auto-reset to scanning after 2 seconds
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
    setDetection((prev) => ({ ...prev, card }));
  }, []);

  const setDetectionCondition = useCallback((condition: Condition) => {
    setDetection((prev) => ({ ...prev, condition }));
  }, []);

  const setDetectionQuantity = useCallback((quantity: number) => {
    setDetection((prev) => ({ ...prev, quantity: Math.max(1, quantity) }));
  }, []);

  const confirmDetection = useCallback(() => {
    if (!detection.card) return;

    const { card, condition, quantity } = detection;

    setTrayItems((prev) => {
      // Check for duplicate: same scryfall ID + same condition
      const existingIndex = prev.findIndex(
        (item) => item.card.id === card.id && item.condition === condition
      );

      if (existingIndex >= 0) {
        // Increment quantity
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + quantity,
        };
        return updated;
      }

      // Add new item
      return [
        {
          id: `tray-${++trayIdCounter}`,
          card,
          condition,
          finish: 'normal' as Finish,
          quantity,
          addedAt: Date.now(),
        },
        ...prev,
      ];
    });

    // Reset to scanning for next card
    lastMatchedNameRef.current = '';
    setDetection({
      status: 'scanning',
      card: null,
      candidates: [],
      condition: 'NM',
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
      { text: 'Clear', style: 'destructive', onPress: () => setTrayItems([]) },
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
    } else {
      Alert.alert(
        'Partial save',
        `${trayItems.length - failures.length} of ${trayItems.length} cards saved. ${failures.length} failed.`
      );
      // Remove only the successfully saved items
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
    setDetectionQuantity,
    confirmDetection,
    dismissDetection,

    trayItems,
    trayCount: trayItems.length,
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
