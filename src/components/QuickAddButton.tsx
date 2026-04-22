import { forwardRef, useImperativeHandle } from 'react';
import {
  TouchableOpacity,
  View,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withSpring,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSize } from '../constants';

export type QuickAddButtonHandle = {
  playSuccess: (accentColor?: string | null) => void;
};

type Props = {
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export const QuickAddButton = forwardRef<QuickAddButtonHandle, Props>(
  function QuickAddButton({ onPress, onLongPress, accessibilityLabel, style }, ref) {
    const scale = useSharedValue(1);
    const flashOpacity = useSharedValue(1);
    const checkOpacity = useSharedValue(0);
    const plusY = useSharedValue(0);
    const plusOpacity = useSharedValue(0);
    const plusColor = useSharedValue<string>('#FFFFFF');

    useImperativeHandle(ref, () => ({
      playSuccess: (accent) => {
        const tint = accent && accent.trim().length > 0 ? accent : '#FFFFFF';
        // Pulse the whole button so the press feels "juicy". Peak is
        // subtle (≤1.08) and the return uses withTiming — a spring tail
        // here made the button feel "inflated" for too long.
        scale.value = withSequence(
          withTiming(1.08, { duration: 110 }),
          withTiming(1, { duration: 160 })
        );
        // Flash → check morph: flash fades out as check fades in, then
        // reverses so the idle icon is always the lightning bolt.
        flashOpacity.value = withSequence(
          withTiming(0, { duration: 120 }),
          withDelay(380, withTiming(1, { duration: 180 }))
        );
        checkOpacity.value = withSequence(
          withTiming(1, { duration: 120 }),
          withDelay(260, withTiming(0, { duration: 180 }))
        );
        // Game-feel "+1" that rises out of the button and fades out.
        plusColor.value = tint;
        plusY.value = 0;
        plusOpacity.value = 0;
        plusY.value = withTiming(-48, { duration: 620 });
        plusOpacity.value = withSequence(
          withTiming(1, { duration: 120 }),
          withDelay(260, withTiming(0, { duration: 240 }))
        );
      },
    }));

    const btnAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
    const flashAnim = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));
    const checkAnim = useAnimatedStyle(() => ({ opacity: checkOpacity.value }));
    const plusAnim = useAnimatedStyle(() => ({
      transform: [{ translateY: plusY.value }],
      opacity: plusOpacity.value,
      color: plusColor.value,
    }));

    return (
      <View style={[styles.wrap, style]} pointerEvents="box-none">
        <Animated.Text
          style={[styles.plusOne, plusAnim]}
          pointerEvents="none"
          allowFontScaling={false}
        >
          +1
        </Animated.Text>
        <TouchableOpacity
          onPress={onPress}
          onLongPress={onLongPress}
          activeOpacity={0.7}
          accessibilityLabel={accessibilityLabel}
          style={styles.touchable}
        >
          <Animated.View style={[styles.btn, btnAnim]}>
            <Animated.View style={flashAnim}>
              <Ionicons name="flash" size={22} color={colors.primary} />
            </Animated.View>
            <Animated.View style={[styles.overlayIcon, checkAnim]}>
              <Ionicons name="checkmark" size={24} color={colors.primary} />
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    position: 'relative',
  },
  touchable: {
    flex: 1,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
  },
  overlayIcon: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusOne: {
    position: 'absolute',
    alignSelf: 'center',
    top: 6,
    fontSize: fontSize.lg,
    fontWeight: '800',
    zIndex: 10,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
