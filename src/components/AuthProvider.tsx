import { createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { useAuth } from '../hooks/useAuth';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { colors } from '../constants';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isAnonymous: boolean;
  isReady: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  isAnonymous: true,
  isReady: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  return useContext(AuthContext);
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
