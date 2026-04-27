import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import type { ScryfallCard } from '../../lib/scryfall';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../constants';

type Props = {
  suggestions: ScryfallCard[];
  onSelect: (query: string) => void;
};

function SearchSuggestionsListInner({ suggestions, onSelect }: Props) {
  if (suggestions.length === 0) return null;

  // Tapping a suggestion submits a search for that card name — it
  // doesn't jump straight to a card detail. Behaves like Google's
  // autocomplete: pick a phrase, see the results page.
  return (
    <BlurView
      intensity={60}
      tint="light"
      experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
      style={styles.container}
    >
      <View style={styles.tint}>
        {suggestions.map((card, idx) => (
          <View key={card.id}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => onSelect(card.name)}
              activeOpacity={0.6}
            >
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <Text style={styles.name} numberOfLines={1}>{card.name}</Text>
            </TouchableOpacity>
            {idx < suggestions.length - 1 && <View style={styles.separator} />}
          </View>
        ))}
      </View>
    </BlurView>
  );
}

export const SearchSuggestionsList = memo(SearchSuggestionsListInner);

const styles = StyleSheet.create({
  container: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    borderBottomLeftRadius: borderRadius.sm,
    borderBottomRightRadius: borderRadius.sm,
    overflow: 'hidden',
    ...shadows.md,
  },
  tint: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    gap: spacing.md,
  },
  name: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginLeft: spacing.lg + 16 + spacing.md,
  },
});
