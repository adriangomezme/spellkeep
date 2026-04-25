import { Text, type TextStyle, type StyleProp } from 'react-native';

// Wrapper around the mana-font (Andrew Gioia, OFL). Maps semantic
// names (type/rarity tokens) to the unicode codepoints baked into
// the font so callers don't need to know the magic numbers.

// Card-type glyphs (canonical icons used by the official rules).
const TYPE_GLYPHS: Record<TypeGlyph, string> = {
  artifact: '\ue61e',
  battle: '\ue9d1',
  creature: '\ue61f',
  enchantment: '\ue620',
  instant: '\ue621',
  land: '\ue622',
  planeswalker: '\ue623',
  sorcery: '\ue624',
  multicolor: '\ue985',
};

// Rarity is a single "M" gem in the font; the variant comes from
// the tint color. We expose semantic names + their canonical
// rarity-gem colors here so consumers can render them consistently.
export const RARITY_COLORS: Record<RarityGlyph, string> = {
  common: '#1A1718',
  uncommon: '#707883',
  rare: '#A58E4A',
  mythic: '#BF4427',
  bonus: '#7B5BA8',
};
const RARITY_GLYPH = '\ue96c';

export type TypeGlyph =
  | 'artifact'
  | 'battle'
  | 'creature'
  | 'enchantment'
  | 'instant'
  | 'land'
  | 'planeswalker'
  | 'sorcery'
  | 'multicolor';

export type RarityGlyph = 'common' | 'uncommon' | 'rare' | 'mythic' | 'bonus';

type Props =
  | { kind: 'type'; code: TypeGlyph; size?: number; color?: string; style?: StyleProp<TextStyle> }
  | { kind: 'rarity'; code: RarityGlyph; size?: number; color?: string; style?: StyleProp<TextStyle> };

export function MTGGlyph(props: Props) {
  const size = props.size ?? 24;
  const color =
    props.color ??
    (props.kind === 'rarity' ? RARITY_COLORS[props.code] : '#0D0D0D');
  const glyph =
    props.kind === 'rarity' ? RARITY_GLYPH : TYPE_GLYPHS[props.code];

  return (
    <Text
      style={[
        { fontFamily: 'Mana', fontSize: size, color, lineHeight: size },
        props.style,
      ]}
    >
      {glyph}
    </Text>
  );
}
