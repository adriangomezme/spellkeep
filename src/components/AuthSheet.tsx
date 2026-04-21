import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { colors, spacing, fontSize, borderRadius } from '../constants';
import { supabase } from '../lib/supabase';
import { useAuthContext } from './AuthProvider';

type Mode = 'signup' | 'login';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialMode?: Mode;
};

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthSheet({ visible, onClose, initialMode = 'signup' }: Props) {
  const { isAnonymous } = useAuthContext();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setMode(initialMode);
    setEmail('');
    setPassword('');
    setError(null);
    setInfo(null);
    setLoading(false);
  }, [visible, initialMode]);

  const emailValid = EMAIL_RX.test(email.trim());
  const passwordValid = password.length >= 8;
  const canSubmit = emailValid && passwordValid && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        onClose();
        return;
      }
      // Sign up path. If the user is currently anonymous, link the
      // credentials to the existing user id so their collections, alerts
      // and scan history follow over.
      if (isAnonymous) {
        const { error: err } = await supabase.auth.updateUser({
          email: email.trim(),
          password,
        });
        if (err) throw err;
        setInfo(
          'Check your email to confirm the address. Your collection is preserved on this device.'
        );
        return;
      }
      const { error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (err) throw err;
      setInfo('Check your email to confirm the address, then log in.');
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === 'login'
      ? 'Log in'
      : isAnonymous
        ? 'Save your collection'
        : 'Create account';
  const subtitle =
    mode === 'login'
      ? 'Access your collection from any device.'
      : isAnonymous
        ? 'Link an email so your data follows you across devices.'
        : 'Sign up with email and password.';
  const primaryLabel =
    mode === 'login' ? 'Log in' : isAnonymous ? 'Save account' : 'Create account';
  const altLabel = mode === 'login' ? 'New here? Sign up' : 'Have an account? Log in';

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        <View style={styles.inputWrap}>
          <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
          <BottomSheetTextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
          />
        </View>

        <View style={styles.inputWrap}>
          <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
          <BottomSheetTextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 8 characters)"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
          />
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
        {info && <Text style={styles.infoText}>{info}</Text>}

        <TouchableOpacity
          style={[styles.cta, !canSubmit && styles.ctaDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>{primaryLabel}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => {
            setMode(mode === 'login' ? 'signup' : 'login');
            setError(null);
            setInfo(null);
          }}
          style={styles.altButton}
          activeOpacity={0.6}
        >
          <Text style={styles.altText}>{altLabel}</Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    paddingVertical: spacing.md,
  },
  errorText: { color: '#C24848', fontSize: fontSize.sm, fontWeight: '500' },
  infoText: { color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 20 },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '700' },
  altButton: { alignSelf: 'center', paddingVertical: spacing.sm },
  altText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
});
