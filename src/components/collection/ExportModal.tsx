import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
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
  { key: 'spellkeep', label: 'SpellKeep CSV', description: 'Full card data in SpellKeep format — type, colors, rarity, cost and layout.', section: 'spellkeep' },
  { key: 'plain', label: 'Plain Text', description: 'Card name, set, quantity and finish — works with most apps.', section: 'standard' },
  { key: 'csv', label: 'CSV', description: 'Standard CSV with all card properties — condition, quantity and Scryfall ID.', section: 'standard' },
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
    <BottomSheet visible={visible} onClose={onClose}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Export</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            From <Text style={styles.subtitleBold}>{collectionName}</Text>
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <View>
        {SECTIONS.map((section) => {
          const sectionFormats = FORMATS.filter((f) => f.section === section.key);
          if (sectionFormats.length === 0) return null;
          return (
            <View key={section.key} style={styles.section}>
              {section.label && <Text style={styles.sectionLabel}>{section.label}</Text>}
              {sectionFormats.map((format, idx) => {
                const isFeatured = format.section === 'spellkeep';
                const isLast = idx === sectionFormats.length - 1;
                return (
                  <TouchableOpacity
                    key={format.key}
                    style={[styles.formatRow, !isLast && styles.formatRowDivider]}
                    onPress={() => handleExport(format.key)}
                    disabled={exporting !== null}
                    activeOpacity={0.6}
                  >
                    <View style={styles.formatContent}>
                      <Text style={[styles.formatLabel, isFeatured && styles.formatLabelHighlight]}>
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
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginTop: 2,
  },
  subtitleBold: {
    color: colors.text,
    fontWeight: '700',
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  section: {
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  formatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  formatRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  formatContent: {
    flex: 1,
  },
  formatLabel: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  formatLabelHighlight: {
    color: colors.primary,
  },
  formatDesc: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 3,
    fontWeight: '500',
  },
});
