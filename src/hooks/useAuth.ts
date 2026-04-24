import { useEffect, useRef, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  getLastUserId,
  setLastUserId,
  clearLastUserId,
} from '../lib/auth/lastUserId';
import { markSyncReset } from '../lib/auth/syncResetAt';
import { resetForUserChange } from '../lib/powersync/system';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  isLoading: boolean;
};

// Handle a user_id transition — wipe local data, mark that a first
// full sync is needed, and force PowerSync to reconnect against the
// new token. Runs in the background; callers observe the flag via
// `needsInitialSync` in AsyncStorage (gated by PowerSyncProvider).
async function handleUserChange(newUserId: string): Promise<void> {
  // Stamp the reset timestamp BEFORE the wipe so the gate is already
  // visible by the time the swap hits SQLite.
  await markSyncReset();
  await setLastUserId(newUserId);
  try {
    await resetForUserChange();
  } catch (err) {
    console.warn('[useAuth] resetForUserChange failed', err);
  }
}

async function handleSignedOut(): Promise<void> {
  await clearLastUserId();
  // Don't flag needs-sync here: the auto-anon signin that follows will
  // trigger handleUserChange with the new anon id, and anon accounts
  // have no remote data to wait on. But we still wipe so the next
  // anon session doesn't inherit the previous user's rows.
  try {
    await resetForUserChange();
  } catch (err) {
    console.warn('[useAuth] resetForUserChange on signout failed', err);
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isAnonymous: true,
    isLoading: true,
  });
  // Track the user id we've already reconciled against lastUserId so
  // token refreshes for the same user don't re-trigger a wipe.
  const reconciledUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function reconcile(session: Session | null) {
      if (cancelled) return;
      const user = session?.user ?? null;
      setState({
        session,
        user,
        isAnonymous: user?.is_anonymous ?? true,
        isLoading: false,
      });

      if (!user) {
        // Signed-out state — clear markers. The auto-anon signin below
        // will emit a fresh SIGNED_IN event with a new anon id and
        // this function runs again.
        if (reconciledUserIdRef.current !== null) {
          reconciledUserIdRef.current = null;
          await handleSignedOut();
        }
        return;
      }

      if (reconciledUserIdRef.current === user.id) return;
      reconciledUserIdRef.current = user.id;

      const last = await getLastUserId();
      if (last === null) {
        // First-ever session on this device — no previous data to
        // reconcile against. Just record the id.
        await setLastUserId(user.id);
      } else if (last !== user.id) {
        // Real transition: wipe + reconnect + flag splash.
        await handleUserChange(user.id);
      }
    }

    // 1. Set up listener FIRST so we don't miss any events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        reconcile(session);
      }
    );

    // 2. THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        reconcile(session);
      } else {
        // No session → create anonymous user; onAuthStateChange takes
        // over once the SIGNED_IN event lands.
        supabase.auth.signInAnonymously().catch((err) => {
          console.error('Anonymous sign-in error:', err);
          setState((prev) => ({ ...prev, isLoading: false }));
        });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    ...state,
    isReady: !state.isLoading,
    signOut,
  };
}
