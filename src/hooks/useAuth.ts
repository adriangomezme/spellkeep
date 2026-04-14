import { useEffect, useState, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  isLoading: boolean;
  isReady: boolean;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    user: null,
    isAnonymous: true,
    isLoading: true,
    isReady: false,
  });

  useEffect(() => {
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setState((prev) => ({
          ...prev,
          session,
          user: session?.user ?? null,
          isAnonymous: session?.user?.is_anonymous ?? true,
          isLoading: false,
          isReady: true,
        }));
      }
    );

    // Check for existing session, if none → sign in anonymously
    initAuth();

    return () => subscription.unsubscribe();
  }, []);

  async function initAuth() {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        setState({
          session,
          user: session.user,
          isAnonymous: session.user.is_anonymous ?? true,
          isLoading: false,
          isReady: true,
        });
        return;
      }

      // No session → create anonymous user
      const { data, error } = await supabase.auth.signInAnonymously();

      if (error) {
        console.error('Anonymous sign-in error:', error);
        // App still works, just without sync
        setState((prev) => ({ ...prev, isLoading: false, isReady: true }));
        return;
      }

      setState({
        session: data.session,
        user: data.session?.user ?? null,
        isAnonymous: true,
        isLoading: false,
        isReady: true,
      });
    } catch (err) {
      console.error('Auth init error:', err);
      setState((prev) => ({ ...prev, isLoading: false, isReady: true }));
    }
  }

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return {
    ...state,
    signOut,
  };
}
