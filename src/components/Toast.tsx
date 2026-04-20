import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, borderRadius, fontSize, spacing, shadows } from '../constants';

// Minimal global toast — one message at a time, fades in/out on its
// own. No dependency, no provider — a module-level event bus is enough
// for our use case ("Added to <binder>" after a quick-add tap). If two
// toasts fire in quick succession the second replaces the first.

type ToastState = { message: string; seq: number } | null;

let publish: ((state: ToastState) => void) | null = null;
let nextSeq = 0;

export function showToast(message: string): void {
  nextSeq += 1;
  publish?.({ message, seq: nextSeq });
}

export function Toast() {
  const [state, setState] = useState<ToastState>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    publish = setState;
    return () => {
      publish = null;
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setState((prev) => (prev?.seq === state.seq ? null : prev)));
    }, 1500);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // seq is the trigger; opacity/timerRef are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.seq]);

  if (!state) return null;

  return (
    <View pointerEvents="none" style={styles.wrap}>
      <Animated.View style={[styles.toast, { opacity }]}>
        <Text style={styles.message} numberOfLines={2}>{state.message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    backgroundColor: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    maxWidth: '80%',
    ...shadows.lg,
  },
  message: {
    color: colors.background,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textAlign: 'center',
  },
});
