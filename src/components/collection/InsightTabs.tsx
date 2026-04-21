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
              activeOpacity={0.5}
            >
              <View style={[styles.iconBubble, { backgroundColor: tab.color + '1A' }]}>
                <Ionicons name={tab.icon} size={14} color={tab.color} />
              </View>
              <Text style={styles.tabText}>{tab.label}</Text>
              {badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badge}</Text>
                </View>
              )}
              <Ionicons name="chevron-forward" size={12} color={colors.textMuted} />
            </TouchableOpacity>
          );
        })}
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
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#C24848',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
