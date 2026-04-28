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
  '#0A2385', // Brand navy
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
      {/* No color option (dashed circle with diagonal slash) */}
      <TouchableOpacity
        onPress={() => onSelect(null)}
        activeOpacity={0.6}
      >
        <View
          style={[
            styles.ringSlot,
            !selected && { borderColor: colors.textMuted },
          ]}
        >
          <View style={[styles.swatch, styles.noColor]}>
            <View style={styles.noColorSlash} />
          </View>
        </View>
      </TouchableOpacity>

      {COLLECTION_COLORS.map((color) => {
        const isSelected = selected === color;
        const isLight = color === '#F8E7B9' || color === '#FDCB6E';
        return (
          <TouchableOpacity
            key={color}
            onPress={() => onSelect(color)}
            activeOpacity={0.6}
          >
            <View
              style={[
                styles.ringSlot,
                isSelected && { borderColor: color },
              ]}
            >
              <View style={[styles.swatch, { backgroundColor: color }]}>
                {isSelected && (
                  <Ionicons name="checkmark" size={16} color={isLight ? '#333' : '#FFF'} />
                )}
              </View>
            </View>
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
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  ringSlot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noColor: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  noColorSlash: {
    position: 'absolute',
    width: 22,
    height: 1.5,
    backgroundColor: colors.textMuted,
    transform: [{ rotate: '-45deg' }],
  },
});
