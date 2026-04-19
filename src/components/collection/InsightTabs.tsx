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
};

const TABS: InsightTab[] = [
  { key: 'top-movers', label: 'Top Movers', icon: 'trending-up' },
  { key: 'price-alerts', label: 'Price Alerts', icon: 'notifications-outline' },
  { key: 'recently-added', label: 'Recently Added', icon: 'time-outline' },
  { key: 'watchlist', label: 'Watchlist', icon: 'eye-outline' },
  { key: 'market-trends', label: 'Market Trends', icon: 'bar-chart-outline' },
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
            <Ionicons name={tab.icon} size={14} color={colors.textSecondary} />
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
});
