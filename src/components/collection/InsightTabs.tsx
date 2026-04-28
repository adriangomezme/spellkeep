import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import { useTriggeredReadAt } from '../../lib/triggeredReadState';

type InsightTab = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
};

const TABS: InsightTab[] = [
  { key: 'top-movers', label: 'Top Movers', icon: 'trending-up', color: colors.success },
  { key: 'price-alerts', label: 'Price Alerts', icon: 'notifications-outline', color: colors.accent },
  { key: 'recently-added', label: 'Recently Added', icon: 'time-outline', color: colors.textSecondary },
  { key: 'watchlist', label: 'Watchlist', icon: 'eye-outline', color: '#A371D6' },
  { key: 'market-trends', label: 'Market Trends', icon: 'bar-chart-outline', color: '#D2682B' },
];

type Props = {
  onTabPress: (key: string) => void;
};

export function InsightTabs({ onTabPress }: Props) {
  // Badge counts trigger events the user hasn't seen yet. Zero-out by
  // opening the Triggered tab, which advances the read cursor. See
  // src/lib/triggeredReadState.ts.
  const readAt = useTriggeredReadAt();
  const { data: unreadRows } = useQuery<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM price_alert_events WHERE at > ?`,
    [readAt ?? '1970-01-01T00:00:00.000Z']
  );
  const triggeredCount = Number(unreadRows?.[0]?.cnt ?? 0);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {TABS.map((tab) => {
          const badge = tab.key === 'price-alerts' && triggeredCount > 0 ? triggeredCount : 0;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.tab}
              onPress={() => onTabPress(tab.key)}
              activeOpacity={0.6}
            >
              <Ionicons name={tab.icon} size={15} color={tab.color} />
              <Text style={styles.tabText}>{tab.label}</Text>
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  scrollContent: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 13,
  },
});
