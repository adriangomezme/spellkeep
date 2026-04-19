import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri, formatUSD } from '../lib/scryfall';
import { colors, spacing, fontSize, borderRadius } from '../constants';

type Props = {
  visible: boolean;
  prints: ScryfallCard[];
  selectedId: string | null;
  onSelect: (card: ScryfallCard) => void;
  onClose: () => void;
};

const COLUMNS = 2;
const GAP = spacing.md;
const HORIZONTAL_PADDING = spacing.lg;
const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - HORIZONTAL_PADDING * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
const CARD_HEIGHT = CARD_WIDTH * 1.4; // standard MTG ratio

export function PrintPickerModal({
  visible,
  prints,
  selectedId,
  onSelect,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerBtn} />
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Choose printing</Text>
            <Text style={styles.subtitle}>{prints.length} printings</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} style={[styles.headerBtn, styles.closeBtn]}>
            <Ionicons name="close" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.grid}>
            {prints.map((p) => (
              <PrintCell
                key={p.id}
                print={p}
                active={p.id === selectedId}
                onPress={() => onSelect(p)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function PrintCell({
  print,
  active,
  onPress,
}: {
  print: ScryfallCard;
  active: boolean;
  onPress: () => void;
}) {
  const price =
    print.prices?.usd ??
    print.prices?.usd_foil ??
    print.prices?.usd_etched;

  return (
    <TouchableOpacity
      style={styles.cell}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.imageWrap, active && styles.imageWrapActive]}>
        <Image
          source={{ uri: getCardImageUri(print, 'normal') }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
        {active && (
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        )}
      </View>
      <Text style={styles.setName} numberOfLines={1}>{print.set_name}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          #{print.collector_number} · {(print.set ?? '').toUpperCase()}
        </Text>
        {price && <Text style={styles.price}>{formatUSD(price)}</Text>}
      </View>
    </TouchableOpacity>
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerBtn: {
    width: 40,
  },
  closeBtn: {
    alignItems: 'flex-end',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  content: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingTop: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
  cell: {
    width: CARD_WIDTH,
  },
  imageWrap: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 3,
    borderColor: 'transparent',
    position: 'relative',
  },
  imageWrapActive: {
    borderColor: colors.textSecondary,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  checkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.textSecondary,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  setName: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 6,
  },
  meta: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    flexShrink: 1,
  },
  price: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
});
