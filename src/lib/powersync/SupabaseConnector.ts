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
   * Called automatically by PowerSync when there are pending local writes.
   */
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (!transaction) {
      return;
    }

    let lastOp: CrudEntry | null = null;

    try {
      for (const op of transaction.crud) {
        lastOp = op;
        const table = supabase.from(op.table);
        let result: any;

        switch (op.op) {
          case UpdateType.PUT: {
            const record = { ...op.opData, id: op.id };
            result = await table.upsert(record);
            break;
          }
          case UpdateType.PATCH: {
            result = await table.update(op.opData ?? {}).eq('id', op.id);
            break;
          }
          case UpdateType.DELETE: {
            result = await table.delete().eq('id', op.id);
            break;
          }
        }

        if (result?.error) {
          throw result.error;
        }
      }

      await transaction.complete();
    } catch (ex: any) {
      console.error('Upload error:', ex);

      if (
        typeof ex.code === 'string' &&
        FATAL_RESPONSE_CODES.some((regex) => regex.test(ex.code))
      ) {
        // Fatal error (constraint violation, etc.) — discard the transaction
        // to avoid blocking the upload queue
        console.error('Fatal upload error — discarding transaction:', lastOp, ex);
        await transaction.complete();
      } else {
        // Retriable error — re-throw so PowerSync retries later
        throw ex;
      }
    }
  }
}
