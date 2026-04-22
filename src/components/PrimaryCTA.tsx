import { ReactNode } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize, spacing, borderRadius } from '../constants';

// ─────────────────────────────────────────────────────────────────────────
// Stripe/Shopify-style split primary CTA.
//
// The icon lives in its own `primaryDark` slot to the left; the label
// sits in a `primary` slot that fills the remaining width. The extra
// vertical strip reads as architectural structure — the button stops
// looking like a flat rectangle and starts looking like a compound
// control with a deliberate entry point.
//
// Use this for prominent primary actions (Add to collection, Create,
// Confirm). For subtle actions (chips, pills) keep the existing
// flat-primary or tint patterns.
// ─────────────────────────────────────────────────────────────────────────

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Props = Omit<TouchableOpacityProps, 'children'> & {
  /** Ionicons glyph shown in the left slot. Ignored if `leading` is set. */
  icon?: IoniconName;
  /** Custom node rendered in the left slot in place of `icon` — e.g. a
   *  quantity badge ("3×") for checkout-style CTAs. Stripe/Shopify trick. */
  leading?: ReactNode;
  /** Text shown in the right (wider) slot. */
  label: string;
  /** Show a spinner while a network request runs. */
  loading?: boolean;
  /** Outer wrapper style override (width, margin, alignSelf). */
  style?: ViewStyle;
  /** Optional trailing element rendered to the right of the label — e.g.
   *  a chevron. Rendered inside the label slot. */
  trailing?: ReactNode;
  /** Visual variant. Defaults to the split look (icon/leading on its own
   *  dark slot). Use `solid` for a clean flat primary with only a label. */
  variant?: 'split' | 'solid';
};

export function PrimaryCTA({
  icon,
  leading,
  label,
  loading,
  disabled,
  style,
  trailing,
  variant = 'split',
  ...rest
}: Props) {
  const isDisabled = disabled || loading;

  if (variant === 'solid') {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={isDisabled}
        {...rest}
        style={[styles.outer, styles.solid, isDisabled && styles.outerDisabled, style]}
      >
        {loading ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <Text style={styles.label} numberOfLines={1}>
              {label}
            </Text>
            {trailing}
          </>
        )}
      </TouchableOpacity>
    );
  }

  let leadingContent: ReactNode;
  if (loading) {
    leadingContent = <ActivityIndicator color="#FFFFFF" size="small" />;
  } else if (leading != null) {
    leadingContent = leading;
  } else if (icon) {
    leadingContent = <Ionicons name={icon} size={20} color="#FFFFFF" />;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={isDisabled}
      {...rest}
      style={[styles.outer, isDisabled && styles.outerDisabled, style]}
    >
      <View style={styles.iconSlot}>{leadingContent}</View>
      <View style={styles.labelSlot}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {trailing}
      </View>
    </TouchableOpacity>
  );
}

const ICON_SLOT_WIDTH = 52;

const styles = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    overflow: 'hidden',
    minHeight: 52,
  },
  solid: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  outerDisabled: {
    opacity: 0.55,
  },
  iconSlot: {
    width: ICON_SLOT_WIDTH,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  label: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
