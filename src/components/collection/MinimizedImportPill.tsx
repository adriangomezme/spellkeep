import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, borderRadius, fontSize, shadows, spacing } from '../../constants';
import { useImportJob } from './ImportJobProvider';

// How far above the tab bar the pill floats. The tab bar itself has its own
// height + safe-area bottom inset, so we stack above both.
const TAB_BAR_HEIGHT = 64;

function phaseLabel(phase: string) {
  switch (phase) {
    case 'parsing':
      return 'Preparing…';
    case 'resolving':
      return 'Resolving cards';
    case 'resolving_online':
      return 'Looking up new cards';
    case 'uploading':
      return 'Saving to collection';
    case 'done':
      return 'Finishing up';
    default:
      return 'Importing';
  }
}

export function MinimizedImportPill() {
  const { job, expand, dismiss } = useImportJob();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;

  // Mount animation. We show only when the job exists AND is either minimized
  // (while running) or finished (to surface the completion state).
  const visible = !!job && (job.minimized || job.status !== 'running');

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : 24,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  if (!job) return null;

  const isRunning = job.status === 'running';
  const isCompleted = job.status === 'completed';
  const isFailed = job.status === 'failed';
  const hasFailures = isCompleted && (job.result?.failed.length ?? 0) > 0;

  const percent =
    job.total > 0 ? Math.min(100, Math.round((job.current / job.total) * 100)) : 0;

  const title = isRunning
    ? `${phaseLabel(job.phase)} · ${percent}%`
    : isFailed
    ? 'Import failed'
    : hasFailures
    ? 'Import complete · some failed'
    : 'Import complete';

  const subtitle = isRunning
    ? `${job.current.toLocaleString()} / ${job.total.toLocaleString()} · ${job.collectionName}`
    : isFailed
    ? job.error ?? 'Tap to see details'
    : buildCompletedSubtitle(job.result, job.collectionName);

  const accentColor = isRunning
    ? colors.primary
    : isFailed
    ? colors.error
    : hasFailures
    ? colors.warning
    : colors.success;

  const iconName = isRunning
    ? 'cloud-upload-outline'
    : isFailed
    ? 'alert-circle'
    : hasFailures
    ? 'checkmark-done'
    : 'checkmark-circle';

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.wrapper,
        {
          bottom: TAB_BAR_HEIGHT + insets.bottom + spacing.sm,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <Pressable style={styles.pill} onPress={expand} android_ripple={{ color: colors.borderLight }}>
        <View style={[styles.iconBubble, { backgroundColor: accentColor }]}>
          <Ionicons name={iconName} size={18} color="#FFFFFF" />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
          {isRunning && (
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accentColor }]} />
            </View>
          )}
        </View>
        {!isRunning && (
          <Pressable
            hitSlop={12}
            onPress={dismiss}
            style={styles.dismissBtn}
            accessibilityLabel="Dismiss"
          >
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        )}
      </Pressable>
    </Animated.View>
  );
}

function buildCompletedSubtitle(
  result: { imported: number; updated: number; failed: string[]; total: number } | null,
  collectionName: string
) {
  if (!result) return collectionName;
  const saved = result.imported + result.updated;
  const parts = [`${saved.toLocaleString()} saved`];
  if (result.failed.length > 0) parts.push(`${result.failed.length.toLocaleString()} failed`);
  parts.push(collectionName);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    ...Platform.select({
      android: { elevation: 6 },
      default: {},
    }),
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.surface,
    ...shadows.lg,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  track: {
    marginTop: 6,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  dismissBtn: {
    padding: spacing.xs,
  },
});
