import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { shareAsync } from 'expo-sharing';
import { cacheDirectory, writeAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { exportCollection, type ExportFormat } from '../../lib/export';
import { colors, spacing, fontSize } from '../../constants';

type FormatOption = {
  key: ExportFormat;
  label: string;
  description: string;
  section: 'spellkeep' | 'standard';
};

const FORMATS: FormatOption[] = [
  { key: 'spellkeep', label: 'SpellKeep CSV', description: 'Full card data in SpellKeep proprietary format.\nIncludes type, colors, rarity, cost, and layout.', section: 'spellkeep' },
  { key: 'plain', label: 'Plain Text', description: 'Card name, set, quantity, and finish.\nSimple text format compatible with most apps.', section: 'standard' },
  { key: 'csv', label: 'CSV', description: 'Standard CSV with all card properties.\nIncludes condition, quantity, and Scryfall ID.', section: 'standard' },
];

const SECTIONS: { key: string; label: string | null }[] = [
  { key: 'spellkeep', label: null },
  { key: 'standard', label: 'Standard' },
];

type Props = {
  visible: boolean;
  collectionId: string;
  collectionName: string;
  onClose: () => void;
};

export function ExportModal({ visible, collectionId, collectionName, onClose }: Props) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    try {
      const { content, filename, mimeType } = await exportCollection(collectionId, collectionName, format);
      const fileUri = `${cacheDirectory}${filename}`;
      await writeAsStringAsync(fileUri, content, { encoding: EncodingType.UTF8 });
      await shareAsync(fileUri, { mimeType, dialogTitle: `Export ${collectionName}` });
    } catch (err: any) {
      Alert.alert('Export Error', err.message ?? 'Failed to export');
    } finally {
      setExporting(null);
    }
  }

  return (
    // Dynamic sizing — with only three formats the fixed 75% sheet was
    // leaving huge blank space under the last row. The ScrollView still
    // renders for future-proofing but no longer stretches to fill.
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Export</Text>
      <Text style={styles.subtitle}>{collectionName}</Text>

      <ScrollView showsVerticalScrollIndicator={false} nestedScrollEnabled>
        {SECTIONS.map((section) => {
          const sectionFormats = FORMATS.filter((f) => f.section === section.key);
          if (sectionFormats.length === 0) return null;
          return (
            <View key={section.key}>
              {section.label && <Text style={styles.sectionLabel}>{section.label}</Text>}
              {sectionFormats.map((format) => {
                const isSpellKeep = format.section === 'spellkeep';
                return (
                  <TouchableOpacity
                    key={format.key}
                    style={styles.formatRow}
                    onPress={() => handleExport(format.key)}
                    disabled={exporting !== null}
                    activeOpacity={0.5}
                  >
                    <View style={styles.formatContent}>
                      <Text style={[styles.formatLabel, isSpellKeep && styles.formatLabelHighlight]}>
                        {format.label}
                      </Text>
                      <Text style={styles.formatDesc}>{format.description}</Text>
                    </View>
                    {exporting === format.key ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  formatContent: {
    flex: 1,
  },
  formatLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  formatLabelHighlight: {
    color: colors.primary,
  },
  formatDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
});
