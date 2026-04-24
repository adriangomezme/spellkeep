import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  borderRadius,
  colors,
  fontSize,
  shadows,
  spacing,
} from '../constants';

const PROGRESS_WIDTH = 220;
const FILL_WIDTH = 64;
const ICON_SIZE = 84;

// Rotating micro-copy — keeps the screen feeling alive during the
// longer syncs (21k-card accounts can take a minute on cold network).
const MESSAGES = [
  'Fetching your binders…',
  'Loading your cards…',
  'Syncing your alerts…',
  'Almost there…',
] as const;

export function SyncSplash() {
  // Pulse: icon breathes; halo expands and fades for depth.
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, []);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.05]) }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulse.value, [0, 1], [1, 1.5]) }],
    opacity: interpolate(pulse.value, [0, 1], [0.22, 0]),
  }));

  // Indeterminate progress: a navy chunk slides across a soft track.
  const shimmer = useSharedValue(0);
  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          shimmer.value,
          [0, 1],
          [-FILL_WIDTH, PROGRESS_WIDTH]
        ),
      },
    ],
  }));

  // Rotating message index.
  const [msgIndex, setMsgIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setMsgIndex((i) => (i + 1) % MESSAGES.length),
      2500
    );
    return () => clearInterval(t);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.iconStack}>
          <Animated.View style={[styles.halo, haloStyle]} />
          <Animated.View style={[styles.iconWrap, iconStyle]}>
            <Ionicons name="cloud-download" size={36} color="#FFFFFF" />
          </Animated.View>
        </View>

        <Text style={styles.title}>Syncing your collection</Text>
        <Text style={styles.subtitle}>{MESSAGES[msgIndex]}</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, shimmerStyle]} />
        </View>
      </View>

      <View style={styles.tipRow}>
        <Ionicons
          name="lock-closed-outline"
          size={12}
          color={colors.textMuted}
        />
        <Text style={styles.tipText}>
          Your data stays on-device once synced.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    width: '100%',
  },
  iconStack: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  halo: {
    position: 'absolute',
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: colors.primary,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  progressTrack: {
    width: PROGRESS_WIDTH,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSecondary,
    overflow: 'hidden',
  },
  progressFill: {
    width: FILL_WIDTH,
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  tipRow: {
    position: 'absolute',
    bottom: spacing.xxl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surface,
    ...shadows.sm,
  },
  tipText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
});
