import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Pressable,
  type TextInput as RNTextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../../BottomSheet';
import {
  useFilterPresets,
  type FilterPreset,
} from '../../../lib/hooks/useFilterPresets';
import { countActiveSearchFilters, type SearchFilterState } from '../../../lib/search/searchFilters';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../../constants';

type Props = {
  visible: boolean;
  /** Snapshot of the user's current (unapplied) filter draft. Saving
   *  captures this exact state so loading later restores it 1:1. */
  currentFilters: SearchFilterState;
  /** Called when the user picks a preset — parent replaces its local
   *  draft with the preset's filters. */
  onLoad: (preset: FilterPreset) => void;
  onClose: () => void;
};

export function FilterPresetsSheet({ visible, currentFilters, onLoad, onClose }: Props) {
  const { items, save, remove } = useFilterPresets();
  const [name, setName] = useState('');
  const inputRef = useRef<RNTextInput | null>(null);
  const activeCount = countActiveSearchFilters(currentFilters);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await save(trimmed, currentFilters);
    setName('');
  }

  function handleLoad(preset: FilterPreset) {
    onLoad(preset);
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} snapPoints={['65%', '90%']}>
      <View style={styles.header}>
        <Text style={styles.title}>Filter presets</Text>
        <Text style={styles.subtitle}>
          Save the current filters as a named preset, or load one to
          replace your draft.
        </Text>
      </View>

      <View style={styles.saveRow}>
        <Pressable style={styles.input} onPress={() => inputRef.current?.focus()}>
          <Ionicons name="bookmark-outline" size={16} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.inputField}
            placeholder="Preset name…"
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
            onSubmitEditing={handleSave}
            returnKeyType="done"
          />
        </Pressable>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            (!name.trim() || activeCount === 0) && styles.saveBtnDisabled,
          ]}
          onPress={handleSave}
          activeOpacity={0.7}
          disabled={!name.trim() || activeCount === 0}
        >
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.saveLabel}>Save</Text>
        </TouchableOpacity>
      </View>
      {activeCount === 0 && (
        <Text style={styles.helper}>
          Add at least one filter to enable saving.
        </Text>
      )}

      <Text style={styles.sectionLabel}>
        Saved ({items.length})
      </Text>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bookmark-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>No presets yet</Text>
            <Text style={styles.emptyHint}>
              Build a filter combination you'd reuse, then save it here.
            </Text>
          </View>
        ) : (
          items.map((preset) => {
            const count = countActiveSearchFilters(preset.filters);
            return (
              <View key={preset.id} style={styles.presetRow}>
                <TouchableOpacity
                  style={styles.presetTap}
                  onPress={() => handleLoad(preset)}
                  activeOpacity={0.6}
                >
                  <View style={styles.presetIcon}>
                    <Ionicons name="bookmark" size={14} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.presetName} numberOfLines={1}>{preset.name}</Text>
                    <Text style={styles.presetMeta} numberOfLines={1}>
                      {count} filter{count === 1 ? '' : 's'}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => remove(preset.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
    lineHeight: 18,
  },
  saveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
  },
  inputField: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    padding: 0,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveLabel: {
    color: '#FFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
  helper: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginBottom: spacing.sm,
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
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  presetTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  presetIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetName: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  presetMeta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 18,
  },
});
