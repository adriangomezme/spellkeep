import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getOverlayState, subscribeOverlay } from '../lib/uiStore';
import { colors, fontSize, spacing, borderRadius, shadows } from '../constants';

export function GlobalLoadingOverlay() {
  const [state, setState] = useState(getOverlayState());

  useEffect(() => subscribeOverlay(setState), []);

  return (
    <Modal
      transparent
      visible={state.visible}
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator color={colors.primary} size="large" />
          {state.title ? <Text style={styles.title}>{state.title}</Text> : null}
          {state.detail ? <Text style={styles.detail}>{state.detail}</Text> : null}
          {typeof state.progress === 'number' ? (
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(0, Math.min(1, state.progress)) * 100}%` },
                ]}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    minWidth: 240,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    ...shadows.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: spacing.md,
    textAlign: 'center',
  },
  detail: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  barTrack: {
    marginTop: spacing.md,
    width: 220,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surfaceSecondary,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});
