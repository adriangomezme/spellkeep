import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../constants';

// MTG mana colors first, then general palette
export const COLLECTION_COLORS = [
  // MTG Mana
  '#00733E', // Green
  '#0E68AB', // Blue
  '#D3202A', // Red
  '#F8E7B9', // White
  '#150B00', // Black
  // Extended palette
  '#6B8AFF', // Soft blue (default binder)
  '#9B59B6', // Purple
  '#E84393', // Pink
  '#FF6B6B', // Coral
  '#E17055', // Orange
  '#FDCB6E', // Yellow
  '#00B894', // Teal
  '#636E72', // Dark gray
  '#A0A8B8', // Light gray (default folder)
];

type Props = {
  selected: string | null;
  onSelect: (color: string | null) => void;
};

export function ColorPicker({ selected, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {/* No color option */}
      <TouchableOpacity
        style={[styles.swatch, styles.noColor, !selected && styles.swatchSelected]}
        onPress={() => onSelect(null)}
        activeOpacity={0.6}
      >
        {!selected && <Ionicons name="checkmark" size={14} color={colors.textMuted} />}
      </TouchableOpacity>

      {COLLECTION_COLORS.map((color) => {
        const isSelected = selected === color;
        const isLight = color === '#F8E7B9' || color === '#FDCB6E';
        return (
          <TouchableOpacity
            key={color}
            style={[
              styles.swatch,
              { backgroundColor: color },
              isSelected && styles.swatchSelected,
            ]}
            onPress={() => onSelect(color)}
            activeOpacity={0.6}
          >
            {isSelected && (
              <Ionicons name="checkmark" size={14} color={isLight ? '#333' : '#FFF'} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noColor: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  swatchSelected: {
    borderWidth: 2,
    borderColor: colors.text,
  },
});
