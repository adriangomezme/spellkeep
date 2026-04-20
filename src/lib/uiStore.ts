// Tiny module-level subscribable store for a global blocking overlay.
// Used by long-running async paths that straddle a server RPC + a
// PowerSync propagation wait — duplicate/merge/import/delete — so the
// user sees "doing something" instead of a frozen UI while PowerSync
// streams the results back.
//
// Keeps the surface small: one message + optional sub-message + a
// progress fraction for feedback at scale. No store library — just a
// Set of listeners.

type Progress = {
  visible: boolean;
  title?: string;
  detail?: string;
  /** 0..1, omitted = indeterminate spinner. */
  progress?: number;
};

let state: Progress = { visible: false };
const listeners = new Set<(p: Progress) => void>();

export function getOverlayState(): Progress {
  return state;
}

export function subscribeOverlay(fn: (p: Progress) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

function publish(next: Partial<Progress>) {
  state = { ...state, ...next };
  for (const l of listeners) l(state);
}

export const overlay = {
  show(title: string, detail?: string) {
    publish({ visible: true, title, detail, progress: undefined });
  },
  update(detail?: string, progress?: number) {
    publish({ detail, progress });
  },
  hide() {
    publish({ visible: false, title: undefined, detail: undefined, progress: undefined });
  },
};
