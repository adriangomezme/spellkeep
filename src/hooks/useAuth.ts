import { useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  isLoading: boolean;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isAnonymous: true,
    isLoading: true,
  });

  useEffect(() => {
    // 1. Set up listener FIRST so we don't miss any events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState({
          session,
          user: session?.user ?? null,
          isAnonymous: session?.user?.is_anonymous ?? true,
          isLoading: false,
        });
      }
    );

    // 2. THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setState({
          session,
          user: session.user,
          isAnonymous: session.user.is_anonymous ?? true,
          isLoading: false,
        });
      } else {
        // No session → create anonymous user
        supabase.auth.signInAnonymously().catch((err) => {
          console.error('Anonymous sign-in error:', err);
          setState((prev) => ({ ...prev, isLoading: false }));
        });
        // The onAuthStateChange listener will handle the state update
      }
    });

    return () => subscription.unsubscribe();
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
