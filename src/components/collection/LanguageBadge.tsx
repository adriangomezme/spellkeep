import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from '../../constants';

// Small lang indicator rendered on list/grid rows when the entry is not the
// default English printing. Intentionally tiny — it's a glanceable hint, not
// a full multi-language UI (we defer that work; see user feedback).

type Props = {
  language: string | null | undefined;
  style?: 'corner' | 'inline';
};

export function LanguageBadge({ language, style = 'inline' }: Props) {
  const lang = (language ?? 'en').toLowerCase();
  if (lang === 'en') return null;

  const label = lang.toUpperCase();

  if (style === 'corner') {
    return (
      <View style={styles.corner}>
        <Text style={styles.cornerText}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={styles.inline}>
      <Text style={styles.inlineText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  corner: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  cornerText: {
    color: '#FFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  inline: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  inlineText: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
