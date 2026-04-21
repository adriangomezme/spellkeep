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

type Props = {
  visible: boolean;
  onClose: () => void;
  alert: PriceAlert | null;
  onPause: () => void;
  onSnooze: () => void;
  onDelete: () => void;
};

export function AlertActionsSheet({
  visible,
  onClose,
  alert,
  onPause,
  onSnooze,
  onDelete,
}: Props) {
  if (!alert) return null;
  const isPaused = alert.status === 'paused';
  const snoozed =
    !!alert.snoozed_until && new Date(alert.snoozed_until) > new Date();

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
            snoozed
              ? 'Already snoozed. Tap to see the resume time or cancel it early.'
              : 'Pause for a fixed window (1h to 30d) and re-activate automatically when it elapses.'
          }
          onPress={() => trigger(onSnooze)}
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
}: {
  color: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.option}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.optionIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={styles.optionText}>
        <Text style={[styles.optionTitle, destructive && { color }]}>
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
