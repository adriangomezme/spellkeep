import { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAiModel } from '../../src/lib/hooks/useAiModel';
import { AI_MODEL_PRESETS } from '../../src/lib/ai/aiModelPresets';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

// Dev-only screen for picking the OpenRouter model used by every AI
// feature in the app. Will be deleted before launch — leaving it
// behind is the whole reason for the visible "DEV ONLY" badge.

export default function AiModelScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { model, isHydrated, setModel, reset } = useAiModel();
  const [draft, setDraft] = useState<string | null>(null);

  const value = draft ?? model;
  const dirty = draft !== null && draft.trim() !== model.trim();
  const trimmed = value.trim();
  const matchedPreset = AI_MODEL_PRESETS.find((p) => p.slug === trimmed);

  async function handleSave() {
    await setModel(trimmed);
    setDraft(null);
  }

  async function handleReset() {
    await reset();
    setDraft(null);
  }

  function handleSelectPreset(slug: string) {
    setDraft(slug);
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
        <Text style={styles.headerTitle}>AI Model</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.devBadge}>
          <Ionicons name="construct" size={12} color={colors.warning} />
          <Text style={styles.devBadgeText}>Dev only — will be removed before launch</Text>
        </View>

        <Text style={styles.intro}>
          Override the OpenRouter model used by every AI feature in the
          app. Leave empty to use the server default.
        </Text>

        {/* ── Active status ── */}
        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Active</Text>
          {!isHydrated ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : trimmed.length === 0 ? (
            <Text style={styles.statusValue}>
              <Text style={styles.statusMuted}>Server default </Text>
              <Text style={styles.statusBadgeMuted}>(no override)</Text>
            </Text>
          ) : (
            <Text style={styles.statusValue}>
              {matchedPreset ? matchedPreset.label : trimmed}
              {matchedPreset && (
                <Text style={styles.statusMuted}>  ·  {trimmed}</Text>
              )}
            </Text>
          )}
        </View>

        {/* ── Free-form input ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Model slug</Text>
          <Text style={styles.sectionDescription}>
            Format: <Text style={styles.mono}>provider/model-name</Text>. Server
            allowlist applies — invalid slugs are rejected with a list of
            allowed models.
          </Text>
          <Pressable style={styles.inputField}>
            <TextInput
              value={value}
              onChangeText={setDraft}
              placeholder="anthropic/claude-haiku-4.5"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              style={styles.input}
            />
            {value.length > 0 && (
              <TouchableOpacity
                onPress={() => setDraft('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </Pressable>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.saveBtn, !dirty && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!dirty}
              activeOpacity={0.7}
            >
              <Ionicons name="checkmark" size={16} color="#FFF" />
              <Text style={styles.saveLabel}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={handleReset}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={16} color={colors.text} />
              <Text style={styles.resetLabel}>Reset to default</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Presets ── */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Presets</Text>
          <Text style={styles.sectionDescription}>
            Tap a model to load its slug above. Save to apply.
          </Text>
          <View style={styles.presetList}>
            {AI_MODEL_PRESETS.map((preset) => {
              const selected = trimmed === preset.slug;
              return (
                <TouchableOpacity
                  key={preset.slug}
                  style={[styles.presetRow, selected && styles.presetRowSelected]}
                  onPress={() => handleSelectPreset(preset.slug)}
                  activeOpacity={0.6}
                >
                  <View style={styles.presetMain}>
                    <Text style={[styles.presetLabel, selected && styles.presetLabelSelected]}>
                      {preset.label}
                    </Text>
                    <Text style={styles.presetSlug}>{preset.slug}</Text>
                  </View>
                  <View style={styles.presetMeta}>
                    <Text style={styles.presetVendor}>{preset.vendor}</Text>
                    <Text style={styles.presetHint}>{preset.hint}</Text>
                  </View>
                  {selected && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.primary}
                      style={{ marginLeft: spacing.sm }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { color: colors.text, fontSize: fontSize.xl, fontWeight: '800' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  devBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    backgroundColor: colors.warning + '1A',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  devBadgeText: {
    color: colors.warning,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  intro: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  statusCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  statusLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  statusMuted: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  statusBadgeMuted: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontStyle: 'italic',
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
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionDescription: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  mono: {
    fontFamily: 'Courier',
    color: colors.text,
  },
  inputField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontFamily: 'Courier',
    padding: 0,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  saveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveLabel: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
  },
  resetLabel: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  presetList: {
    gap: spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  presetRowSelected: {
    backgroundColor: colors.primaryLight,
  },
  presetMain: {
    flex: 1,
  },
  presetLabel: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  presetLabelSelected: {
    color: colors.primary,
  },
  presetSlug: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontFamily: 'Courier',
    marginTop: 2,
  },
  presetMeta: {
    alignItems: 'flex-end',
  },
  presetVendor: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  presetHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontStyle: 'italic',
  },
});
