import { StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSortPreference } from '../../src/lib/hooks/useSortPreference';
import {
  updateSortPreferenceLocal,
  type SortMode,
  type SortPrefKey,
} from '../../src/lib/collections.local';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

type OptionDef = { value: SortMode; label: string };

const OPTIONS: OptionDef[] = [
  { value: 'name_asc',     label: 'Name · A → Z' },
  { value: 'name_desc',    label: 'Name · Z → A' },
  { value: 'created_asc',  label: 'Created · Oldest first' },
  { value: 'created_desc', label: 'Created · Newest first' },
  { value: 'custom',       label: 'Custom order' },
];

type Section = {
  label: string;
  subtitle: string;
  prefKey: SortPrefKey;
  value: SortMode;
};

export default function SortPreferencesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pref = useSortPreference();

  const sections: Section[] = [
    {
      label: 'Folders',
      subtitle: 'Order of folders inside the Collection hub',
      prefKey: 'folder_sort_mode',
      value: pref.folder,
    },
    {
      label: 'Binders',
      subtitle: 'Order of binders, both at root and inside folders',
      prefKey: 'binder_sort_mode',
      value: pref.binder,
    },
    {
      label: 'Lists',
      subtitle: 'Order of lists, both at root and inside folders',
      prefKey: 'list_sort_mode',
      value: pref.list,
    },
  ];

  function handleSelect(key: SortPrefKey, value: SortMode) {
    updateSortPreferenceLocal(key, value).catch(() => {});
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sorting</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Choose how each surface is sorted. Custom lets you drag items into any order from the Collection hub — long-press a folder or binder and tap Reorder.
        </Text>

        {sections.map((section) => (
          <View key={section.prefKey} style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>{section.label}</Text>
            <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
            <View style={styles.options}>
              {OPTIONS.map((option) => {
                const selected = section.value === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => handleSelect(section.prefKey, option.value)}
                    activeOpacity={0.6}
                  >
                    <Text
                      style={[styles.optionLabel, selected && styles.optionLabelSelected]}
                    >
                      {option.label}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark" size={18} color={colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
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
  sectionLabel: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  sectionSubtitle: { color: colors.textMuted, fontSize: fontSize.sm, marginTop: 2, marginBottom: spacing.md },
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
});
