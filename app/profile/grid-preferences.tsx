import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  useCollectionViewPrefs,
  CARDS_PER_ROW_OPTIONS,
  type CardsPerRow,
} from '../../src/lib/hooks/useCollectionViewPrefs';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

export default function GridPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { cardsPerRow, setCardsPerRow } = useCollectionViewPrefs();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Grid</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          How many cards per row in Owned, binders and lists. Saved on this device only.
        </Text>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Cards per row</Text>
          <View style={styles.options}>
            {CARDS_PER_ROW_OPTIONS.map((option) => {
              const selected = cardsPerRow === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.option, selected && styles.optionSelected]}
                  onPress={() => setCardsPerRow(option as CardsPerRow)}
                  activeOpacity={0.6}
                >
                  <Text
                    style={[styles.optionLabel, selected && styles.optionLabelSelected]}
                  >
                    {option} {option === 1 ? 'card' : 'cards'}
                  </Text>
                  {selected && (
                    <Ionicons name="checkmark" size={18} color={colors.primary} />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Preview</Text>
          <View style={styles.previewRow}>
            {Array.from({ length: cardsPerRow }).map((_, i) => (
              <View key={i} style={[styles.previewTile, { flex: 1 }]} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xxl, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  intro: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  options: { gap: spacing.xs },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surfaceSecondary,
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
  },
  optionLabel: { color: colors.text, fontSize: fontSize.md, fontWeight: '500' },
  optionLabelSelected: { color: colors.primary, fontWeight: '700' },
  previewCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  previewLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  previewTile: {
    aspectRatio: 1 / 1.395,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
  },
});
