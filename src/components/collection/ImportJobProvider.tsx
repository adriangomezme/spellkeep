import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  importToCollection,
  type ImportFormat,
  type ImportProgress,
  type ImportResult,
} from '../../lib/import';

// ── Types ────────────────────────────────────────────────────────────────

export type ImportPhase = ImportProgress['phase'] | 'queued';

export type ImportJob = {
  id: string;
  collectionId: string;
  collectionName: string;
  format: ImportFormat;
  status: 'running' | 'completed' | 'failed';
  phase: ImportPhase;
  current: number;
  total: number;
  result: ImportResult | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
  // UI state: which surface owns the progress right now.
  minimized: boolean;
};

type StartParams = {
  text: string;
  format: ImportFormat;
  collectionId: string;
  collectionName: string;
};

type ImportJobContextValue = {
  job: ImportJob | null;
  // Returns the job id on success, or throws 'busy' if one is already running.
  startImport: (params: StartParams) => Promise<string>;
  minimize: () => void;
  expand: () => void;
  dismiss: () => void;
};

const ImportJobContext = createContext<ImportJobContextValue | null>(null);

// Throttle progress writes so 100k row updates don't trigger 100k React
// renders. Flushed on every phase change and on completion.
const PROGRESS_THROTTLE_MS = 150;

function newJobId() {
  return `import_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ── Provider ─────────────────────────────────────────────────────────────

export function ImportJobProvider({ children }: { children: React.ReactNode }) {
  const [job, setJob] = useState<ImportJob | null>(null);
  // Guard against a second concurrent start. We can't rely on `job` state
  // alone because state updates are async; a tight re-click could slip past.
  const runningRef = useRef(false);
  const lastProgressAtRef = useRef(0);

  const startImport = useCallback(async ({ text, format, collectionId, collectionName }: StartParams) => {
    if (runningRef.current) {
      throw new Error('An import is already in progress. Wait for it to finish.');
    }
    runningRef.current = true;
    lastProgressAtRef.current = 0;

    const id = newJobId();
    const startedAt = Date.now();

    setJob({
      id,
      collectionId,
      collectionName,
      format,
      status: 'running',
      phase: 'parsing',
      current: 0,
      total: 0,
      result: null,
      error: null,
      startedAt,
      finishedAt: null,
      minimized: false,
    });

    const onProgress = (progress: ImportProgress) => {
      const now = Date.now();
      const phaseChanged = progress.phase === 'done';
      if (!phaseChanged && now - lastProgressAtRef.current < PROGRESS_THROTTLE_MS) {
        return;
      }
      lastProgressAtRef.current = now;
      setJob((prev) => {
        if (!prev || prev.id !== id) return prev;
        if (prev.phase === progress.phase && prev.current === progress.current && prev.total === progress.total) {
          return prev;
        }
        return {
          ...prev,
          phase: progress.phase,
          current: progress.current,
          total: progress.total,
        };
      });
    };

    // Kick off the pipeline. We don't await so the caller returns quickly;
    // the context updates drive the UI from here on.
    (async () => {
      try {
        const result = await importToCollection(text, format, collectionId, onProgress);
        setJob((prev) => {
          if (!prev || prev.id !== id) return prev;
          return {
            ...prev,
            status: 'completed',
            phase: 'done',
            current: result.imported + result.updated + result.failed.length,
            total: result.total,
            result,
            finishedAt: Date.now(),
          };
        });
      } catch (err: any) {
        setJob((prev) => {
          if (!prev || prev.id !== id) return prev;
          return {
            ...prev,
            status: 'failed',
            error: err?.message ?? 'Import failed',
            finishedAt: Date.now(),
          };
        });
      } finally {
        runningRef.current = false;
      }
    })();

    return id;
  }, []);

  const minimize = useCallback(() => {
    setJob((prev) => (prev ? { ...prev, minimized: true } : prev));
  }, []);

  const expand = useCallback(() => {
    setJob((prev) => (prev ? { ...prev, minimized: false } : prev));
  }, []);

  const dismiss = useCallback(() => {
    setJob((prev) => {
      if (!prev) return prev;
      // Refuse to dismiss a job that's still running; the caller should
      // minimize instead.
      if (prev.status === 'running') return prev;
      return null;
    });
  }, []);

  return (
    <ImportJobContext.Provider value={{ job, startImport, minimize, expand, dismiss }}>
      {children}
    </ImportJobContext.Provider>
  );
}

export function useImportJob() {
  const ctx = useContext(ImportJobContext);
  if (!ctx) throw new Error('useImportJob must be used inside ImportJobProvider');
  return ctx;
}
