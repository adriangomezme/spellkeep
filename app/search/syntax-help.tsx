import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { stagePendingSyntaxQuery } from '../../src/lib/search/pendingSyntaxQuery';
import { colors, spacing, fontSize, borderRadius, shadows } from '../../src/constants';

// iOS ships Menlo as the default fixed-pitch font; Android doesn't,
// so 'Menlo' falls back to the system serif there. `monospace` is the
// generic Android keyword that resolves to Roboto Mono / DroidSans
// Mono. Both platforms get a consistent typewriter look this way.
const MONOSPACE_FONT = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

// ──────────────────────────────────────────────────────────────────────
// Reference content — every recognized Scryfall syntax operator
// grouped by topic. Each example carries an explanation and a "Try"
// button that hands the query off to the Search input via
// `pendingSyntaxQuery`.
// ──────────────────────────────────────────────────────────────────────

type Example = { query: string; explanation: string };
type Section = {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  intro?: string;
  examples: Example[];
};

const SECTIONS: Section[] = [
  {
    title: 'Names & text',
    icon: 'text-outline',
    intro:
      'Search by card name and oracle text. Quoted phrases stay together; an exclamation point forces an exact-name match.',
    examples: [
      { query: 'lightning', explanation: 'Cards whose name contains "lightning".' },
      { query: '!"Lightning Bolt"', explanation: 'Exact match — only the card "Lightning Bolt".' },
      { query: 'o:flying', explanation: 'Oracle text contains "flying".' },
      { query: 'o:"draws a card"', explanation: 'Oracle text contains the exact phrase "draws a card".' },
      { query: 'o:draw o:land', explanation: 'Oracle text mentions both "draw" AND "land".' },
    ],
  },
  {
    title: 'Type & subtype',
    icon: 'cube-outline',
    intro:
      'The `t:` operator matches any token in the type line — supertypes, types, and subtypes.',
    examples: [
      { query: 't:creature', explanation: 'Any card that\'s a creature.' },
      { query: 't:elf t:warrior', explanation: 'Cards that are BOTH Elf AND Warrior.' },
      { query: '(t:angel OR t:demon)', explanation: 'Cards that are Angels OR Demons.' },
      { query: 't:legendary t:creature', explanation: 'Legendary creatures only.' },
    ],
  },
  {
    title: 'Colors & color identity',
    icon: 'color-palette-outline',
    intro:
      '`c:` filters by mana-cost colors; `id:` filters by color identity (cost + rules text + indicator). Colors: w, u, b, r, g (or `c` for colorless).',
    examples: [
      { query: 'c:r', explanation: 'Red cards (any card that is red).' },
      { query: 'c:wu', explanation: 'Cards that are white AND blue.' },
      { query: 'c=wu', explanation: 'Exactly white-blue, no other colors.' },
      { query: 'c<=ur', explanation: 'Mono-blue, mono-red, blue-red, or colorless.' },
      { query: 'id:wug', explanation: 'Color identity at most white, blue, green (Bant or subset).' },
      { query: 'c:c', explanation: 'Colorless cards.' },
      { query: 'c:m', explanation: 'Multicolor cards.' },
    ],
  },
  {
    title: 'Mana value & stats',
    icon: 'flame-outline',
    intro:
      '`cmc` (or `mv`) is mana value. `pow`, `tou`, `loy` accept numbers, `*`, or `X`.',
    examples: [
      { query: 'cmc=3', explanation: 'Mana value exactly 3.' },
      { query: 'cmc>=7', explanation: 'Mana value 7 or more.' },
      { query: 'pow>=4 tou>=4', explanation: 'Power and toughness both at least 4.' },
      { query: 'pow=*', explanation: 'Cards with variable power (like *).' },
      { query: 'loy<=3', explanation: 'Planeswalkers with starting loyalty 3 or less.' },
    ],
  },
  {
    title: 'Set, rarity & collector number',
    icon: 'albums-outline',
    intro: 'Filter by printing — set code, rarity, or collector number.',
    examples: [
      { query: 'set:mh3', explanation: 'Cards from Modern Horizons 3.' },
      { query: 'r:mythic', explanation: 'Mythic-rare cards only.' },
      { query: 'r:common set:cmm', explanation: 'Common cards from Commander Masters.' },
      { query: 'cn:236 set:mh3', explanation: 'Specific printing by collector number.' },
    ],
  },
  {
    title: 'Legality',
    icon: 'shield-checkmark-outline',
    intro: 'Format legality. `legal:`, `banned:`, `restricted:` accept any format key.',
    examples: [
      { query: 'legal:commander', explanation: 'Commander-legal cards.' },
      { query: 'legal:modern -legal:standard', explanation: 'Modern-legal but NOT standard-legal.' },
      { query: 'banned:legacy', explanation: 'Cards banned in Legacy.' },
    ],
  },
  {
    title: 'Keywords & abilities',
    icon: 'bookmarks-outline',
    intro: 'Match cards that have a specific keyword ability.',
    examples: [
      { query: 'keyword:flying', explanation: 'Cards with the Flying keyword.' },
      { query: 'keyword:trample keyword:vigilance', explanation: 'Cards with both Trample and Vigilance.' },
      { query: 'keyword:lifelink', explanation: 'Cards with Lifelink.' },
      { query: 'keyword:hexproof', explanation: 'Cards with Hexproof.' },
    ],
  },
  {
    title: 'Game availability',
    icon: 'game-controller-outline',
    intro: 'Where the card is legal to play.',
    examples: [
      { query: 'game:arena', explanation: 'Cards available on MTG Arena.' },
      { query: 'game:paper', explanation: 'Cards printed on paper.' },
      { query: '(game:arena OR game:mtgo)', explanation: 'Cards on either digital client.' },
    ],
  },
  {
    title: 'Flags & special states',
    icon: 'pricetag-outline',
    intro:
      'Boolean flags Scryfall computes — including hand-curated land cycles every player knows by name. Prefix with `-is:` to negate.',
    examples: [
      { query: 'is:fetchland', explanation: 'Fetch lands (Flooded Strand, Wooded Foothills, etc).' },
      { query: 'is:shockland', explanation: 'Shock lands (Hallowed Fountain, Steam Vents, etc).' },
      { query: 'is:triome', explanation: 'Triomes — three-color lands from Ikoria & Streets.' },
      { query: 'is:dual', explanation: 'Original dual lands (Tundra, Underground Sea, etc).' },
      { query: 'is:reserved', explanation: 'Cards on the Reserved List.' },
      { query: 'is:commander', explanation: 'Valid Commander commanders.' },
      { query: 'is:firstprint', explanation: 'Original printings only.' },
      { query: 'is:reprint', explanation: 'Reprints (not first printings).' },
      { query: 'is:promo', explanation: 'Promotional printings.' },
      { query: 'is:universesbeyond', explanation: 'Universes Beyond crossovers.' },
      { query: '-is:funny', explanation: 'Exclude Un-set / silver-bordered cards.' },
    ],
  },
  {
    title: 'Price',
    icon: 'cash-outline',
    intro: 'Filter by USD price (`usd:`), or use `tix:` / `eur:` for those markets.',
    examples: [
      { query: 'usd<=1', explanation: 'Cards $1 or less in USD.' },
      { query: 'usd>=20', explanation: 'Cards $20 or more.' },
      { query: 'usd>=10 r:common', explanation: 'Expensive commons.' },
    ],
  },
  {
    title: 'Artist',
    icon: 'brush-outline',
    intro: 'Quoted artist names handle multi-word matches.',
    examples: [
      { query: 'a:"Rebecca Guay"', explanation: 'Cards illustrated by Rebecca Guay.' },
      { query: 'a:"john avon" t:land', explanation: 'Lands by John Avon.' },
    ],
  },
  {
    title: 'Combining clauses',
    icon: 'git-branch-outline',
    intro:
      'Multiple clauses are AND-combined by default. Use `OR` for unions and parens to group. Prefix with `-` to negate.',
    examples: [
      { query: 't:creature c:g cmc<=2', explanation: 'Green creatures costing 2 or less.' },
      { query: '(t:elf OR t:goblin) c:r', explanation: 'Red Elves or red Goblins.' },
      { query: 't:creature -c:g', explanation: 'Creatures that are NOT green.' },
      { query: 'o:flying -o:flash', explanation: 'Has flying, but not flash.' },
    ],
  },
  {
    title: 'Result grouping & order',
    icon: 'copy-outline',
    intro:
      '`unique:` controls how Scryfall groups printings. `order:` sorts the list. Use the `Group results` and `Sort` controls in the toolbar instead of typing these directly when you can.',
    examples: [
      { query: 'lightning unique:cards', explanation: 'One row per card concept.' },
      { query: 'lightning unique:art', explanation: 'One row per illustration (default).' },
      { query: 'sol unique:prints order:edhrec', explanation: 'Every printing of "sol" cards, ordered by EDHREC popularity.' },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────────────────────────────

export default function SyntaxHelpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  function handleTry(query: string) {
    stagePendingSyntaxQuery(query);
    router.back();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Search syntax</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text style={styles.introText}>
            The Search bar accepts every operator{' '}
            <Text style={styles.introBold}>scryfall.com</Text> understands.
            Combine clauses with spaces (AND), <Text style={styles.code}>OR</Text>{' '}
            for unions, parentheses to group, and a leading{' '}
            <Text style={styles.code}>-</Text> to exclude. Tap any example
            to load it into the search input.
          </Text>
        </View>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={section.icon} size={16} color={colors.primary} />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            {section.intro && (
              <Text style={styles.sectionIntro}>{section.intro}</Text>
            )}
            {section.examples.map((ex) => (
              <TouchableOpacity
                key={ex.query}
                style={styles.example}
                onPress={() => handleTry(ex.query)}
                activeOpacity={0.6}
              >
                <View style={styles.exampleLeft}>
                  <Text style={styles.exampleCode} numberOfLines={1}>
                    {ex.query}
                  </Text>
                  <Text style={styles.exampleExplain}>{ex.explanation}</Text>
                </View>
                <View style={styles.tryBtn}>
                  <Ionicons name="play" size={11} color={colors.primary} />
                  <Text style={styles.tryLabel}>Try</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ))}

        <TouchableOpacity
          onPress={() => Linking.openURL('https://scryfall.com/docs/syntax')}
          activeOpacity={0.6}
          style={styles.outroBtn}
        >
          <Ionicons name="open-outline" size={14} color={colors.primary} />
          <Text style={styles.outroLink}>
            Full reference at scryfall.com/docs/syntax
          </Text>
        </TouchableOpacity>
        <View style={{ height: insets.bottom + spacing.xxl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  intro: {
    paddingVertical: spacing.md,
  },
  introText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  introBold: {
    color: colors.text,
    fontWeight: '700',
  },
  code: {
    fontFamily: MONOSPACE_FONT,
    color: colors.text,
    fontSize: fontSize.sm,
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
  },
  sectionIntro: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  example: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.divider,
  },
  exampleLeft: {
    flex: 1,
    minWidth: 0,
  },
  exampleCode: {
    color: colors.text,
    fontFamily: MONOSPACE_FONT,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  exampleExplain: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    lineHeight: 16,
  },
  tryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.primaryLight,
  },
  tryLabel: {
    color: colors.primary,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  outroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  outroLink: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
