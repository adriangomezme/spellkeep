import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Keyboard,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import type { ImportFormat } from '../../lib/import';
import { useImportJob } from './ImportJobProvider';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import { PrimaryCTA } from '../PrimaryCTA';

type FormatOption = {
  key: ImportFormat;
  label: string;
  description: string;
  allowPaste: boolean;
  section: 'spellkeep' | 'standard' | 'thirdparty';
};

const FORMATS: FormatOption[] = [
  { key: 'spellkeep', label: 'SpellKeep CSV', description: 'CSV exported by SpellKeep — full card data, finish and layout.', allowPaste: false, section: 'spellkeep' },
  { key: 'plain', label: 'Plain Text', description: 'Card name, set, quantity. Supports foil and etched flags.', allowPaste: true, section: 'standard' },
  { key: 'csv', label: 'CSV', description: 'Standard CSV with header row — auto-detects columns by name.', allowPaste: true, section: 'standard' },
  { key: 'hevault', label: 'Hevault CSV', description: 'CSV exported by Hevault — uses Scryfall IDs to keep variants distinct.', allowPaste: false, section: 'thirdparty' },
];

const SECTIONS: { key: string; label: string | null }[] = [
  { key: 'spellkeep', label: null },
  { key: 'standard', label: 'Standard' },
  { key: 'thirdparty', label: 'Third Party' },
];

type Step = 'format' | 'input';

type Props = {
  visible: boolean;
  collectionId: string;
  collectionName: string;
  onClose: () => void;
  onImported: () => void;
};

export function ImportModal({ visible, collectionId, collectionName, onClose }: Props) {
  const { startImport } = useImportJob();
  const [step, setStep] = useState<Step>('format');
  const [format, setFormat] = useState<ImportFormat>('plain');
  const [pasteText, setPasteText] = useState('');

  const currentFormat = FORMATS.find((f) => f.key === format);
  const allowPaste = currentFormat?.allowPaste ?? false;

  function reset() {
    setStep('format');
    setFormat('plain');
    setPasteText('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFormatSelect(f: ImportFormat) {
    setFormat(f);
    setStep('input');
  }

  async function handleFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/*', 'application/csv', 'text/csv', 'text/plain'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const content = await readAsStringAsync(result.assets[0].uri);
      await runImport(content);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to read file');
    }
  }

  async function handlePaste() {
    Keyboard.dismiss();
    if (!pasteText.trim()) {
      Alert.alert('Empty', 'Paste your card list first');
      return;
    }
    await runImport(pasteText);
  }

  async function runImport(text: string) {
    try {
      await startImport({ text, format, collectionId, collectionName });
      reset();
      onClose();
    } catch (err: any) {
      Alert.alert('Import Error', err.message ?? 'Failed to start import');
    }
  }

  return (
    <BottomSheet visible={visible} onClose={handleClose}>
      {step === 'format' ? (
        <>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>Import</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                Into <Text style={styles.subtitleBold}>{collectionName}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
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
                  {sectionFormats.map((f, idx) => {
                    const isLast = idx === sectionFormats.length - 1;
                    const isFeatured = f.section === 'spellkeep';
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.formatRow, !isLast && styles.formatRowDivider]}
                        onPress={() => handleFormatSelect(f.key)}
                        activeOpacity={0.6}
                      >
                        <View style={styles.formatContent}>
                          <Text style={[styles.formatLabel, isFeatured && styles.formatLabelHighlight]}>
                            {f.label}
                          </Text>
                          <Text style={styles.formatDesc}>{f.description}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </>
      ) : (
        <>
          {/* Input header (back + title + cancel) */}
          <View style={styles.header}>
            <View style={styles.backRow}>
              <TouchableOpacity
                onPress={() => setStep('format')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="chevron-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.title}>{currentFormat?.label}</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.fileButton} onPress={handleFile} activeOpacity={0.6}>
            <Ionicons name="document-attach-outline" size={20} color={colors.primary} />
            <View style={styles.fileButtonText}>
              <Text style={styles.fileButtonLabel}>Choose file</Text>
              <Text style={styles.fileButtonHint}>Pick a {currentFormat?.label} file from Files</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {allowPaste && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or paste below</Text>
                <View style={styles.dividerLine} />
              </View>

              <BottomSheetTextInput
                style={styles.pasteInput}
                placeholder="Paste your card list here…"
                placeholderTextColor={colors.textMuted}
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <PrimaryCTA
                variant="solid"
                style={styles.cta}
                label="Import"
                onPress={handlePaste}
                disabled={!pasteText.trim()}
              />
            </>
          )}
        </>
      )}
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
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  fileButtonText: {
    flex: 1,
    minWidth: 0,
  },
  fileButtonLabel: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  fileButtonHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '500',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  pasteInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    height: 130,
    fontFamily: 'Courier',
  },
  cta: {
    minHeight: 44,
    marginTop: spacing.md,
  },
});
