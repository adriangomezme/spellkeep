import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type InsightTab = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
};

const TABS: InsightTab[] = [
  { key: 'top-movers', label: 'Top Movers', icon: 'trending-up', color: '#1D9E58' },
  { key: 'price-alerts', label: 'Price Alerts', icon: 'notifications-outline', color: '#E0A52B' },
  { key: 'recently-added', label: 'Recently Added', icon: 'time-outline', color: '#6B8AFF' },
  { key: 'watchlist', label: 'Watchlist', icon: 'eye-outline', color: '#A371D6' },
  { key: 'market-trends', label: 'Market Trends', icon: 'bar-chart-outline', color: '#D2682B' },
];

type Props = {
  onTabPress: (key: string) => void;
};

export function InsightTabs({ onTabPress }: Props) {
  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.5}
          >
            <View style={[styles.iconBubble, { backgroundColor: tab.color + '1A' }]}>
              <Ionicons name={tab.icon} size={14} color={tab.color} />
            </View>
            <Text style={styles.tabText}>{tab.label}</Text>
            <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  scrollContent: {
    gap: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingLeft: spacing.xs + 2,
    paddingRight: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBubble: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
