import { useCallback, useMemo, useState } from 'react';

// Generic bulk-selection state. Agnostic to what's being selected —
// keys are opaque strings (e.g. collection_cards.id). Intended for
// FlatList-backed grids that enter a "selection mode" via long-press
// and stay active until the user confirms an action or cancels.

export type BulkSelection = {
  isActive: boolean;
  selectedIds: Set<string>;
  size: number;
  enter: (firstId?: string) => void;
  exit: () => void;
  toggle: (id: string) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
};

export function useBulkSelection(): BulkSelection {
  const [isActive, setIsActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enter = useCallback((firstId?: string) => {
    setIsActive(true);
    if (firstId) {
      setSelectedIds(new Set([firstId]));
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const exit = useCallback(() => {
    setIsActive(false);
    setSelectedIds(new Set());
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Stable closure over the current Set — cheap because `selectedIds`
  // is state and memo rebinds on change. Avoids passing the Set down
  // to every memoized card (which would force a re-render on every
  // selection change).
  const isSelected = useMemo(() => {
    return (id: string) => selectedIds.has(id);
  }, [selectedIds]);

  return {
    isActive,
    selectedIds,
    size: selectedIds.size,
    enter,
    exit,
    toggle,
    clear,
    isSelected,
  };
}
