import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
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

type FormatOption = {
  key: ImportFormat;
  label: string;
  description: string;
  allowPaste: boolean;
  section: 'spellkeep' | 'standard' | 'thirdparty';
};

const FORMATS: FormatOption[] = [
  { key: 'spellkeep', label: 'SpellKeep CSV', description: 'CSV file exported by SpellKeep.\nIncludes full card data, finish, and layout.', allowPaste: false, section: 'spellkeep' },
  { key: 'plain', label: 'Plain Text', description: 'Simple text list with card name, set, and quantity.\nSupports foil and etched flags.', allowPaste: true, section: 'standard' },
  { key: 'csv', label: 'CSV', description: 'Standard CSV with header row.\nAuto-detects columns by name.', allowPaste: true, section: 'standard' },
  { key: 'hevault', label: 'Hevault CSV', description: 'CSV file exported by Hevault.\nUses Scryfall IDs so language and etched variants stay distinct.', allowPaste: false, section: 'thirdparty' },
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
      // Hand off to the global ImportStatusSheet; close the starter.
      reset();
      onClose();
    } catch (err: any) {
      Alert.alert('Import Error', err.message ?? 'Failed to start import');
    }
  }

  // Format picker needs a tall fixed sheet so the list scrolls cleanly.
  // The input step is much shorter (just a Choose File button, or that
  // plus a small paste area) — use dynamic sizing there so the sheet
  // hugs the content and doesn't leave hundreds of pixels of blank
  // space below the CTA.
  const snapPoints = step === 'format'
    ? ['75%', '90%']
    : allowPaste ? ['55%', '85%'] : undefined;

  return (
    <BottomSheet visible={visible} onClose={handleClose} snapPoints={snapPoints}>
      {step === 'format' ? (
        <>
          <Text style={styles.title}>Import</Text>
          <Text style={styles.subtitle}>into {collectionName}</Text>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} nestedScrollEnabled>
            {SECTIONS.map((section) => {
              const sectionFormats = FORMATS.filter((f) => f.section === section.key);
              if (sectionFormats.length === 0) return null;
              return (
                <View key={section.key}>
                  {section.label && <Text style={styles.sectionLabel}>{section.label}</Text>}
                  {sectionFormats.map((f) => (
                    <TouchableOpacity
                      key={f.key}
                      style={styles.formatRow}
                      onPress={() => handleFormatSelect(f.key)}
                      activeOpacity={0.5}
                    >
                      <View style={styles.formatContent}>
                        <Text style={[styles.formatLabel, f.section === 'spellkeep' && styles.formatLabelHighlight]}>
                          {f.label}
                        </Text>
                        <Text style={styles.formatDesc}>{f.description}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.inputHeader}>
            <TouchableOpacity onPress={() => setStep('format')}>
              <Ionicons name="chevron-back" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={styles.inputTitle}>{currentFormat?.label}</Text>
            <View style={{ width: 24 }} />
          </View>

          <TouchableOpacity style={styles.fileButton} onPress={handleFile} activeOpacity={0.6}>
            <Ionicons name="folder-open-outline" size={20} color={colors.primary} />
            <Text style={styles.fileButtonText}>Choose File</Text>
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
                placeholder="Paste your card list here..."
                placeholderTextColor={colors.textMuted}
                value={pasteText}
                onChangeText={setPasteText}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity
                style={[styles.importButton, !pasteText.trim() && styles.importButtonDisabled]}
                onPress={handlePaste}
                disabled={!pasteText.trim()}
              >
                <Ionicons name="cloud-upload-outline" size={18} color="#FFFFFF" />
                <Text style={styles.importButtonText}>Import</Text>
              </TouchableOpacity>
            </>
          )}
        </>
      )}
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
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  inputTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderStyle: 'dashed',
  },
  fileButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.divider,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  pasteInput: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    fontSize: fontSize.sm,
    color: colors.text,
    height: 150,
    fontFamily: 'Courier',
  },
  importButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  importButtonDisabled: {
    opacity: 0.5,
  },
  importButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
