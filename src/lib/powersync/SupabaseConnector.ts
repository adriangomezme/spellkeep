import {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/react-native';
import { supabase } from '../supabase';

/**
 * Regex patterns for Postgres error codes that are fatal and should not be retried.
 * These include constraint violations (22xxx, 23xxx) and permission errors (42501).
 */
const FATAL_RESPONSE_CODES = [
  new RegExp('^22...$'), // data exception
  new RegExp('^23...$'), // integrity constraint violation
  new RegExp('^42501$'), // insufficient privilege
];

// Max rows per Supabase PostgREST request. 500 × ~200 bytes ≈ 100 KB,
// well under the PostgREST body limit and comfortable for latency.
const BATCH_SIZE = 500;

// Hard timeout on each Supabase request so a silently-dropped socket
// doesn't leave the whole upload loop wedged forever. Backgrounded
// fetches on iOS in particular never resolve when the app suspends.
const REQUEST_TIMEOUT_MS = 30_000;

function withTimeoutSignal(): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { signal: controller.signal, done: () => clearTimeout(t) };
}

/**
 * True when `a` and `b` share the exact same column set. PostgREST
 * `upsert([...])` requires every row in the payload to have identical
 * keys — mixing subsets in one request 400s. Runs of CRUD ops from
 * different callers (add card vs. duplicate binder) are stopped at the
 * boundary instead of being merged.
 */
function sameKeys(a: Record<string, any>, b: Record<string, any>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  const sa = ak.slice().sort();
  const sb = bk.slice().sort();
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
  return true;
}

/**
 * Collapse ops targeting the same primary key into a single row, keeping
 * the latest value per column. Required because PostgREST rejects an
 * upsert whose payload lists the same `id` twice with:
 *   "ON CONFLICT DO UPDATE cannot affect row a second time"
 *
 * Burst writes from the stepper (+1 tapped five times) arrive as five
 * PATCH ops on the same row; without dedup we'd fail the entire batch.
 * Preserves first-seen order so downstream rows keep their relative
 * position in the request.
 */
function dedupById(ops: CrudEntry[]): Array<Record<string, any>> {
  const byId = new Map<string, Record<string, any>>();
  for (const op of ops) {
    const prev = byId.get(op.id);
    if (prev) {
      Object.assign(prev, op.opData ?? {});
    } else {
      byId.set(op.id, { ...(op.opData ?? {}), id: op.id });
    }
  }
  return Array.from(byId.values());
}

export class SupabaseConnector implements PowerSyncBackendConnector {
  /**
   * Fetches credentials for PowerSync.
   * Uses the current Supabase session JWT. If no session exists,
   * signs in anonymously (guest mode).
   */
  async fetchCredentials() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }

    // If no session, create anonymous user (guest mode)
    if (!session) {
      const { data, error: anonError } = await supabase.auth.signInAnonymously();
      if (anonError) throw anonError;
      if (!data.session) throw new Error('Failed to create anonymous session');

      return {
        endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
        token: data.session.access_token,
      };
    }

    return {
      endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
      token: session.access_token,
    };
  }

  /**
   * Uploads local changes to Supabase.
   *
   * Performance-critical: a single duplicate/import can queue 100k rows
   * and a naive per-row loop becomes 100k HTTP round-trips. We batch
   * consecutive same-kind ops on the same table:
   *
   *   • PUT runs    → `upsert([rows])` in batches of BATCH_SIZE
   *   • DELETE runs → `delete().in('id', ids)` in batches
   *   • PATCH runs  → `.update().eq('id', ...)` one-by-one
   *
   * PATCH MUST stay 1-by-1. The obvious "just use upsert" optimisation
   * is broken by RLS: Supabase evaluates BOTH the INSERT and UPDATE
   * policies on an upsert, and if PATCH opData omits NOT-NULL-ish
   * columns like `collection_id`, the INSERT's WITH CHECK fails with
   * 42501 even though the row already exists and the UPDATE path would
   * have succeeded. PATCH volume is bounded in practice — stepper bursts
   * are 5-10 ops, not thousands — so the per-row loop is acceptable.
   *
   * Order is preserved — we only merge adjacent runs of the same (op,
   * table, column-set). Within a batch, if the same id appears multiple
   * times (e.g. a duplicate followed by an import), `dedupById` merges
   * them into one row with the latest value per column so PostgREST
   * doesn't reject the batch.
   *
   * Failures: fatal → transaction.complete() discards the whole tx so
   * the queue drains; non-fatal → throw so PowerSync retries later.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    const ops = transaction.crud;
    let lastOp: CrudEntry | null = null;
    let processed = 0;
    const t0 = Date.now();

    try {
      let i = 0;
      while (i < ops.length) {
        const head = ops[i];
        lastOp = head;
        const table = supabase.from(head.table);

        if (head.op === UpdateType.PUT) {
          let end = i + 1;
          const headData = head.opData ?? {};
          while (
            end < ops.length &&
            ops[end].op === UpdateType.PUT &&
            ops[end].table === head.table &&
            end - i < BATCH_SIZE &&
            sameKeys(headData, ops[end].opData ?? {})
          ) {
            end++;
          }
          const rows = dedupById(ops.slice(i, end));
          const { signal, done } = withTimeoutSignal();
          try {
            const { error } = await table.upsert(rows).abortSignal(signal);
            if (error) throw error;
          } finally {
            done();
          }
          processed += end - i;
          i = end;
        } else if (head.op === UpdateType.PATCH) {
          // 1-by-1 update, see class docstring for why batching is unsafe.
          const { signal, done } = withTimeoutSignal();
          try {
            const { error } = await table.update(head.opData ?? {}).eq('id', head.id).abortSignal(signal);
            if (error) throw error;
          } finally {
            done();
          }
          processed += 1;
          i += 1;
        } else if (head.op === UpdateType.DELETE) {
          let end = i + 1;
          while (
            end < ops.length &&
            ops[end].op === UpdateType.DELETE &&
            ops[end].table === head.table &&
            end - i < BATCH_SIZE
          ) {
            end++;
          }
          const ids = Array.from(new Set(ops.slice(i, end).map((o) => o.id)));
          const { signal, done } = withTimeoutSignal();
          try {
            const { error } = await table.delete().in('id', ids).abortSignal(signal);
            if (error) throw error;
          } finally {
            done();
          }
          processed += end - i;
          i = end;
        } else {
          // Unknown op — skip to keep the loop making progress.
          i += 1;
        }
      }

      await transaction.complete();
      if (ops.length >= 100) {
        console.log(`[ps-upload] drained ${ops.length} ops in ${Date.now() - t0}ms`);
      }
    } catch (ex: any) {
      console.warn('[ps-upload] error', {
        code: ex?.code,
        status: ex?.status,
        message: ex?.message,
        processed,
        remaining: ops.length - processed,
        lastOp: lastOp ? { op: lastOp.op, table: lastOp.table, id: lastOp.id } : null,
      });

      if (
        typeof ex.code === 'string' &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
      ) {
        console.warn('[ps-upload] fatal — discarding transaction');
        await transaction.complete();
      } else {
        throw ex;
      }
    }
  }
}
