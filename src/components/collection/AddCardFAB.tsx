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

type ActionDef = {
  key: 'scan' | 'search' | 'import';
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconBg: string;
  iconColor: string;
  onPress: () => void;
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
    outputRange: [16, 0],
  });

  const rotate = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  function handleAction(action: () => void) {
    setOpen(false);
    action();
  }

  const ACTIONS: ActionDef[] = [
    {
      key: 'scan',
      label: 'Scan',
      description: 'Use the camera',
      icon: 'scan-outline',
      iconBg: colors.primary + '14',
      iconColor: colors.primary,
      onPress: onScan,
    },
    {
      key: 'search',
      label: 'Search',
      description: 'Find by name or set',
      icon: 'search-outline',
      iconBg: colors.success + '1A',
      iconColor: colors.success,
      onPress: onSearch,
    },
    {
      key: 'import',
      label: 'Import',
      description: 'From CSV or plain text',
      icon: 'arrow-down-outline',
      iconBg: colors.accent + '1F',
      iconColor: colors.accent,
      onPress: onImport,
    },
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
            {ACTIONS.map((action, idx) => {
              const isLast = idx === ACTIONS.length - 1;
              return (
                <TouchableOpacity
                  key={action.key}
                  style={[styles.menuItem, !isLast && styles.menuItemDivider]}
                  onPress={() => handleAction(action.onPress)}
                  activeOpacity={0.6}
                >
                  <View style={[styles.menuIcon, { backgroundColor: action.iconBg }]}>
                    <Ionicons name={action.icon} size={18} color={action.iconColor} />
                  </View>
                  <View style={styles.menuText}>
                    <Text style={styles.menuLabel}>{action.label}</Text>
                    <Text style={styles.menuDescription}>{action.description}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.View>
        )}

        <TouchableOpacity
          style={styles.fab}
          onPress={() => setOpen(!open)}
          activeOpacity={0.8}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Ionicons name="add-sharp" size={26} color={colors.text} />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
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
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.xs + 2,
    minWidth: 240,
    ...shadows.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  menuItemDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  menuDescription: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
    marginTop: 1,
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
