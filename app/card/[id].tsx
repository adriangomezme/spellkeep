import { View, Text, ScrollView, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ScryfallCard,
  getCardImageUri,
  formatPrice,
} from '../../src/lib/scryfall';
import { AddToCollectionModal } from '../../src/components/AddToCollectionModal';
import { colors, spacing, fontSize, borderRadius } from '../../src/constants';

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function LegalityBadge({ format, status }: { format: string; status: string }) {
  const isLegal = status === 'legal';
  const isRestricted = status === 'restricted';
  const isBanned = status === 'banned';

  if (status === 'not_legal') return null;

  return (
    <View
      style={[
        styles.legalityBadge,
        isLegal && styles.legalityLegal,
        isRestricted && styles.legalityRestricted,
        isBanned && styles.legalityBanned,
      ]}
    >
      <Text style={styles.legalityText}>
        {format.replace('_', ' ')}
      </Text>
    </View>
  );
}

export default function CardDetailScreen() {
  const { cardJson } = useLocalSearchParams<{ id: string; cardJson: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [showAddModal, setShowAddModal] = useState(false);

  const card: ScryfallCard | null = useMemo(() => {
    try {
      return cardJson ? JSON.parse(cardJson) : null;
    } catch {
      return null;
    }
  }, [cardJson]);

  if (!card) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Card not found</Text>
      </View>
    );
  }

  const imageUri = getCardImageUri(card, 'large');
  const oracleText = card.oracle_text ?? card.card_faces?.[0]?.oracle_text;
  const legalFormats = Object.entries(card.legalities).filter(
    ([, status]) => status !== 'not_legal'
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {card.name}
        </Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Card Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: imageUri }}
            style={styles.cardImage}
            contentFit="contain"
            transition={300}
          />
        </View>

        {/* Prices */}
        <View style={styles.priceRow}>
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Normal</Text>
            <Text style={styles.priceValue}>{formatPrice(card.prices?.usd)}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceItem}>
            <Text style={styles.priceLabel}>Foil</Text>
            <Text style={styles.priceValue}>{formatPrice(card.prices?.usd_foil)}</Text>
          </View>
        </View>

        {/* Info Section */}
        <View style={styles.section}>
          <InfoRow label="Type" value={card.type_line} />
          <InfoRow label="Mana Cost" value={card.mana_cost ?? card.card_faces?.[0]?.mana_cost} />
          <InfoRow label="Mana Value" value={String(card.cmc)} />
          {card.power && (
            <InfoRow label="P/T" value={`${card.power}/${card.toughness}`} />
          )}
          {card.loyalty && <InfoRow label="Loyalty" value={card.loyalty} />}
          <InfoRow label="Set" value={`${card.set_name} (#${card.collector_number})`} />
          <InfoRow label="Rarity" value={card.rarity} />
          <InfoRow label="Artist" value={card.artist} />
        </View>

        {/* Oracle Text */}
        {oracleText && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Oracle Text</Text>
            <Text style={styles.oracleText}>{oracleText}</Text>
          </View>
        )}

        {/* Double-faced card: show back face */}
        {card.card_faces && card.card_faces.length > 1 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {card.card_faces[1].name}
            </Text>
            {card.card_faces[1].type_line && (
              <Text style={styles.faceType}>{card.card_faces[1].type_line}</Text>
            )}
            {card.card_faces[1].oracle_text && (
              <Text style={styles.oracleText}>{card.card_faces[1].oracle_text}</Text>
            )}
          </View>
        )}

        {/* Legalities */}
        {legalFormats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Legalities</Text>
            <View style={styles.legalitiesContainer}>
              {legalFormats.map(([format, status]) => (
                <LegalityBadge key={format} format={format} status={status} />
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add-circle-outline" size={22} color={colors.text} />
            <Text style={styles.actionText}>Add to Collection</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButtonSecondary}>
            <Ionicons name="layers-outline" size={22} color={colors.text} />
            <Text style={styles.actionText}>Add to Deck</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Add to Collection Modal */}
      <AddToCollectionModal
        visible={showAddModal}
        card={card}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          Alert.alert('Added!', `${card.name} added to your collection`);
        }}
      />
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
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxl + 40,
  },
  imageContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  cardImage: {
    width: 280,
    height: 392,
    borderRadius: borderRadius.lg,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  priceItem: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
  },
  priceValue: {
    color: colors.accent,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginTop: 4,
  },
  priceDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: spacing.lg,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 2,
  },
  infoLabel: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  infoValue: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    marginLeft: spacing.md,
  },
  oracleText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  faceType: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginBottom: spacing.sm,
  },
  legalitiesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  legalityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceLight,
  },
  legalityLegal: {
    backgroundColor: '#22c55e22',
    borderWidth: 1,
    borderColor: colors.success,
  },
  legalityRestricted: {
    backgroundColor: '#f59e0b22',
    borderWidth: 1,
    borderColor: colors.warning,
  },
  legalityBanned: {
    backgroundColor: '#ef444422',
    borderWidth: 1,
    borderColor: colors.error,
  },
  legalityText: {
    color: colors.text,
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
  },
  actions: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  actionText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.lg,
    textAlign: 'center',
    marginTop: 100,
  },
});
