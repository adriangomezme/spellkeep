import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { supabase } from '../../lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

export type OwnedLocation = {
  id: string;
  collection_id: string;
  collection_name: string;
  quantity_normal: number;
  quantity_foil: number;
  quantity_etched: number;
};

type Props = {
  visible: boolean;
  cardName: string;
  cardId: string | null;
  condition: string | null;
  language: string | null;
  onClose: () => void;
  onPick: (loc: OwnedLocation) => void;
};

export function OwnedLocationPicker({
  visible,
  cardName,
  cardId,
  condition,
  language,
  onClose,
  onPick,
}: Props) {
  const [rows, setRows] = useState<OwnedLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !cardId || !condition) {
      setRows([]);
      return;
    }
    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_owned_card_locations', {
          p_card_id: cardId,
          p_condition: condition,
          p_language: (language ?? 'en'),
        });
        if (cancelled) return;
        setRows(error ? [] : ((data ?? []) as OwnedLocation[]));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, cardId, condition, language]);

  // If only one binder owns it, auto-pick on the fly so the user skips
  // the extra tap. The parent closes this sheet on pick.
  useEffect(() => {
    if (!isLoading && visible && rows.length === 1) {
      onPick(rows[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, rows, visible]);

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.title} numberOfLines={1}>Edit {cardName}</Text>
      <Text style={styles.subtitle}>Choose which binder to edit</Text>

      {isLoading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No binder holds this card anymore.</Text>
      ) : (
        rows.map((loc) => {
          const total = loc.quantity_normal + loc.quantity_foil + loc.quantity_etched;
          return (
            <TouchableOpacity
              key={loc.id}
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => onPick(loc)}
            >
              <View style={[styles.iconBubble, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="albums" size={18} color={colors.primary} />
              </View>
              <View style={styles.rowInfo}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {loc.collection_name}
                </Text>
                <Text style={styles.rowSubtitle}>
                  {describeQuantities(loc)}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowQty}>×{total}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </View>
            </TouchableOpacity>
          );
        })
      )}
    </BottomSheet>
  );
}

function describeQuantities(loc: OwnedLocation): string {
  const parts: string[] = [];
  if (loc.quantity_normal > 0) parts.push(`${loc.quantity_normal} normal`);
  if (loc.quantity_foil > 0) parts.push(`${loc.quantity_foil} foil`);
  if (loc.quantity_etched > 0) parts.push(`${loc.quantity_etched} etched`);
  return parts.join(' · ');
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginBottom: spacing.md,
  },
  loadingBox: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rowSubtitle: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowQty: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});

// Named-export for the style dict in case a caller wants the height for
// layout math. Currently not used but keeps the surface symmetric.
export const ownedLocationPickerStyles = styles;
