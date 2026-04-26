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

// Mana-cost gem glyphs — the rounded W/U/B/R/G/C symbols printed on
// every Magic card. The font ships them with their canonical color +
// relief baked in, so they need no extra tinting.
const MANA_GLYPHS: Record<ManaGlyph, string> = {
  W: '\ue600',
  U: '\ue601',
  B: '\ue602',
  R: '\ue603',
  G: '\ue604',
  C: '\ue904',
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

export type ManaGlyph = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

type Props =
  | { kind: 'type'; code: TypeGlyph; size?: number; color?: string; style?: StyleProp<TextStyle> }
  | { kind: 'rarity'; code: RarityGlyph; size?: number; color?: string; style?: StyleProp<TextStyle> }
  | { kind: 'mana'; code: ManaGlyph; size?: number; color?: string; style?: StyleProp<TextStyle> };

export function MTGGlyph(props: Props) {
  const size = props.size ?? 24;
  // Mana glyphs ship with baked-in WUBRG color + relief — leave them
  // untinted unless the caller explicitly overrides.
  const defaultColor =
    props.kind === 'rarity'
      ? RARITY_COLORS[props.code]
      : props.kind === 'mana'
      ? undefined
      : '#0D0D0D';
  const color = props.color ?? defaultColor;
  const glyph =
    props.kind === 'rarity'
      ? RARITY_GLYPH
      : props.kind === 'mana'
      ? MANA_GLYPHS[props.code]
      : TYPE_GLYPHS[props.code];

  // Mana gems extend slightly past the nominal cap-height (drop,
  // dragon, tree) — `lineHeight: size` would clip them, so we add
  // headroom for that family only.
  const lineHeight = props.kind === 'mana' ? size * 1.2 : size;

  return (
    <Text
      style={[
        { fontFamily: 'Mana', fontSize: size, lineHeight },
        color != null && { color },
        props.style,
      ]}
    >
      {glyph}
    </Text>
  );
}
