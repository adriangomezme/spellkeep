import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

type Props = {
  onScan: () => void;
  onSearch: () => void;
  onImport: () => void;
};

export function AddCardFAB({ onScan, onSearch, onImport }: Props) {
  const [open, setOpen] = useState(false);
  const animation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(animation, {
      toValue: open ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 60,
    }).start();
  }, [open]);

  const backdropOpacity = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const menuTranslateY = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [20, 0],
  });

  const rotate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  function handleAction(action: () => void) {
    setOpen(false);
    action();
  }

  const ACTIONS = [
    { key: 'scan', label: 'Scan', icon: 'camera-outline' as const, onPress: onScan },
    { key: 'search', label: 'Search', icon: 'search-outline' as const, onPress: onSearch },
    { key: 'import', label: 'Import', icon: 'arrow-down-circle-outline' as const, onPress: onImport },
  ];

  return (
    <>
      {open && (
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        </Animated.View>
      )}

      <View style={styles.fabContainer} pointerEvents="box-none">
        {open && (
          <Animated.View
            style={[
              styles.menu,
              {
                opacity: animation,
                transform: [{ translateY: menuTranslateY }],
              },
            ]}
          >
            {ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.key}
                style={styles.menuItem}
                onPress={() => handleAction(action.onPress)}
                activeOpacity={0.6}
              >
                <Ionicons name={action.icon} size={20} color={colors.text} />
                <Text style={styles.menuLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setOpen(!open)}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add" size={26} color={colors.text} />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    zIndex: 90,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: spacing.lg,
    alignItems: 'flex-end',
    zIndex: 100,
  },
  menu: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.xs,
    minWidth: 160,
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    ...shadows.md,
  },
});
