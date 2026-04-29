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

const PAUSE_COLOR = colors.textSecondary;
const SNOOZE_COLOR = '#6B8AFF';

type Props = {
  visible: boolean;
  onClose: () => void;
  alert: PriceAlert | null;
  onPause: () => void;
  onSnooze: () => void;
  onToggleAutoRearm: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function AlertActionsSheet({
  visible,
  onClose,
  alert,
  onPause,
  onSnooze,
  onToggleAutoRearm,
  onEdit,
  onDelete,
}: Props) {
  if (!alert) return null;
  const isPaused = alert.status === 'paused';
  const isTriggered = alert.status === 'triggered';
  const snoozed =
    !!alert.snoozed_until && new Date(alert.snoozed_until).getTime() > Date.now();
  const rearmOn = !!alert.auto_rearm;
  const rearmAvailable = !(alert.mode === 'price' && !rearmOn);

  function trigger(action: () => void) {
    action();
    onClose();
  }

  const statusText = isPaused
    ? 'Paused indefinitely'
    : snoozed
      ? `Snoozed until ${formatSnoozeDate(alert.snoozed_until!)}`
      : isTriggered
        ? 'Already triggered'
        : 'Active · evaluating each sweep';
  const statusIcon: React.ComponentProps<typeof Ionicons>['name'] = isPaused
    ? 'pause-circle'
    : snoozed
      ? 'moon'
      : isTriggered
        ? 'flash'
        : 'radio-button-on';
  const statusColor = isPaused
    ? PAUSE_COLOR
    : snoozed
      ? SNOOZE_COLOR
      : isTriggered
        ? colors.primary
        : colors.success;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Alert actions</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Subtitle: card identity */}
      <Text style={styles.subtitle} numberOfLines={1}>
        {alert.card_name}
        <Text style={styles.subtitleDot}>  ·  </Text>
        <Text style={styles.subtitleMeta}>
          {alert.card_set.toUpperCase()} #{alert.card_collector_number} · {capitalize(alert.finish)}
        </Text>
      </Text>

      {/* Status strip */}
      <View style={[styles.statusStrip, { backgroundColor: statusColor + '14' }]}>
        <Ionicons name={statusIcon} size={14} color={statusColor} />
        <Text style={[styles.statusText, { color: statusColor }]} numberOfLines={1}>
          {statusText}
        </Text>
      </View>

      {/* Options */}
      <View style={styles.list}>
        <Option
          color={PAUSE_COLOR}
          icon={isPaused ? 'play' : 'pause'}
          title={isPaused ? 'Resume' : 'Pause'}
          description={
            isPaused
              ? 'Re-activate this alert. It starts evaluating again on the next sweep.'
              : 'Stop evaluating indefinitely. Stays off until you resume it manually.'
          }
          onPress={() => trigger(onPause)}
        />
        <Divider />
        <Option
          color={SNOOZE_COLOR}
          icon="moon-outline"
          title={snoozed ? 'Manage snooze' : 'Snooze'}
          description={
            isPaused
              ? 'Not available while the alert is paused. Resume it first.'
              : snoozed
                ? 'See the resume time or cancel the snooze early.'
                : 'Pause for a fixed window (1h to 30d) — re-activates automatically.'
          }
          onPress={() => trigger(onSnooze)}
          disabled={isPaused}
        />
        <Divider />
        <Option
          color={colors.primary}
          icon="refresh"
          title="Auto re-arm"
          description={
            !rearmAvailable
              ? 'Only for percent targets. A fixed price would re-fire near the same value.'
              : rearmOn
                ? 'Keeps watching after each trigger — re-anchors and fires again on the next crossing.'
                : 'Tap to keep this alert watching after each trigger.'
          }
          onPress={() => trigger(onToggleAutoRearm)}
          disabled={!rearmAvailable}
          trailing={
            rearmAvailable ? (
              <View
                style={[
                  styles.togglePill,
                  rearmOn ? styles.togglePillOn : styles.togglePillOff,
                ]}
              >
                <Text
                  style={[
                    styles.togglePillText,
                    { color: rearmOn ? colors.primary : colors.textMuted },
                  ]}
                >
                  {rearmOn ? 'ON' : 'OFF'}
                </Text>
              </View>
            ) : null
          }
        />
        <Divider />
        <Option
          color={colors.primary}
          icon="create-outline"
          title="Edit target"
          description="Change direction, mode, target value or finish. Trigger history is kept."
          onPress={() => trigger(onEdit)}
        />
        <Divider />
        <Option
          color={colors.error}
          icon="trash-outline"
          title="Delete alert"
          description="Remove this alert permanently. Trigger history is preserved on the card."
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
  trailing,
}: {
  color: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  description: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.option, disabled && styles.optionDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.6}
    >
      <View
        style={[
          styles.optionIcon,
          { backgroundColor: (disabled ? colors.textMuted : color) + '1F' },
        ]}
      >
        <Ionicons
          name={icon}
          size={16}
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
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text style={styles.optionDesc}>{description}</Text>
      </View>
      {trailing}
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatSnoozeDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },

  // Subtitle
  subtitle: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  subtitleDot: { color: colors.textMuted },
  subtitleMeta: {
    color: colors.textMuted,
    fontWeight: '500',
  },

  // Status strip
  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm + 2,
    marginTop: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  statusText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  // List
  list: {},
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  optionDisabled: {
    opacity: 0.5,
  },
  optionIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { flex: 1, minWidth: 0 },
  optionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  optionDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },

  // Toggle pill
  togglePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  togglePillOn: {
    backgroundColor: colors.primaryLight,
  },
  togglePillOff: {
    backgroundColor: colors.surfaceSecondary,
  },
  togglePillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
