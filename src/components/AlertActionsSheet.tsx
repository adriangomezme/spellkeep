import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../constants';
import type { PriceAlert } from '../lib/priceAlerts';

const PAUSE_COLOR = '#6B7280';
const SNOOZE_COLOR = '#6B8AFF';
const REARM_COLOR = '#1D9E58';

type Props = {
  visible: boolean;
  onClose: () => void;
  alert: PriceAlert | null;
  onPause: () => void;
  onSnooze: () => void;
  onToggleAutoRearm: () => void;
  onDelete: () => void;
};

export function AlertActionsSheet({
  visible,
  onClose,
  alert,
  onPause,
  onSnooze,
  onToggleAutoRearm,
  onDelete,
}: Props) {
  if (!alert) return null;
  const isPaused = alert.status === 'paused';
  const snoozed =
    !!alert.snoozed_until && new Date(alert.snoozed_until) > new Date();
  const rearmOn = !!alert.auto_rearm;

  function trigger(action: () => void) {
    action();
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>Alert actions</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {alert.card_name}
        </Text>

        <Option
          color={PAUSE_COLOR}
          icon={isPaused ? 'play' : 'pause'}
          title={isPaused ? 'Resume' : 'Pause'}
          description={
            isPaused
              ? 'Re-activate this alert. It will start evaluating again on the next sweep.'
              : 'Stop evaluating indefinitely. Stays off until you resume it manually — no auto expiry.'
          }
          onPress={() => trigger(onPause)}
        />
        <Option
          color={SNOOZE_COLOR}
          icon="moon-outline"
          title={snoozed ? 'Manage snooze' : 'Snooze'}
          description={
            isPaused
              ? "Not available while the alert is paused. Resume it first."
              : snoozed
                ? 'Already snoozed. Tap to see the resume time or cancel it early.'
                : 'Pause for a fixed window (1h to 30d) and re-activate automatically when it elapses.'
          }
          onPress={() => trigger(onSnooze)}
          disabled={isPaused}
        />
        <Option
          color={REARM_COLOR}
          icon="refresh"
          title={rearmOn ? 'Turn off auto re-arm' : 'Turn on auto re-arm'}
          description={
            rearmOn
              ? 'The alert keeps watching after each trigger. Disable to revert to one-shot.'
              : 'Keep watching after each trigger — re-anchors the price and fires again on the next crossing.'
          }
          onPress={() => trigger(onToggleAutoRearm)}
        />
        <Option
          color={colors.error}
          icon="trash-outline"
          title="Delete"
          description="Remove this alert permanently. Trigger history is preserved for reference until you delete the card's other alerts."
          onPress={() => trigger(onDelete)}
          destructive
        />
      </View>
    </BottomSheet>
  );
}

function Option({
  color,
  icon,
  title,
  description,
  onPress,
  destructive,
  disabled,
}: {
  color: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, disabled && styles.optionDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <View
        style={[
          styles.optionIcon,
          { backgroundColor: (disabled ? colors.textMuted : color) + '15' },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={disabled ? colors.textMuted : color}
        />
      </View>
      <View style={styles.optionText}>
        <Text
          style={[
            styles.optionTitle,
            destructive && { color },
            disabled && { color: colors.textMuted },
          ]}
        >
          {title}
        </Text>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: -spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1 },
  optionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  optionDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginTop: 2,
  },
});
