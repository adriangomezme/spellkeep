import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@powersync/react';
import { BottomSheet } from './BottomSheet';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import {
  colors,
  spacing,
  fontSize,
  borderRadius,
} from '../constants';
import {
  createAlertFromCard,
  updateAlertLocal,
  priceFromCard,
  computeTargetUsd,
  type PriceAlert,
  type PriceAlertDirection,
  type PriceAlertMode,
} from '../lib/priceAlerts';
import { formatUSD, getCardImageUri, type ScryfallCard } from '../lib/scryfall';
import type { Finish } from '../lib/collection';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  /** The card to build the alert against (create mode). */
  card?: ScryfallCard | null;
  /** When editing, the existing alert row. `card` still required for display + pricing. */
  existing?: PriceAlert | null;
};

const DIR_UP = '#1D9E58';
const DIR_DOWN = '#C24848';

const DIRECTIONS: { key: PriceAlertDirection; label: string }[] = [
  { key: 'below', label: 'Below' },
  { key: 'above', label: 'Above' },
];

const MODES: { key: PriceAlertMode; label: string }[] = [
  { key: 'price', label: 'By price' },
  { key: 'percent', label: 'By %' },
];

function dirColor(d: PriceAlertDirection) {
  return d === 'above' ? DIR_UP : DIR_DOWN;
}

export function CreateAlertSheet({ visible, onClose, onSaved, card, existing }: Props) {
  const isEdit = !!existing;

  // Finishes available on this print
  const availableFinishes = useMemo<Finish[]>(() => {
    if (!card) return ['normal'];
    const fromList = (card.finishes ?? []).map((f) =>
      f === 'nonfoil' ? 'normal' : (f as Finish)
    );
    if (fromList.length > 0) return fromList;
    const out: Finish[] = [];
    if (card.prices?.usd) out.push('normal');
    if (card.prices?.usd_foil) out.push('foil');
    if (card.prices?.usd_etched) out.push('etched');
    return out.length ? out : ['normal'];
  }, [card]);

  const [finish, setFinish] = useState<Finish>(existing?.finish ?? availableFinishes[0]);
  const [direction, setDirection] = useState<PriceAlertDirection>(
    existing?.direction ?? 'below'
  );
  const [mode, setMode] = useState<PriceAlertMode>(existing?.mode ?? 'percent');
  const [rawValue, setRawValue] = useState<string>(() => {
    if (existing) return String(existing.target_value);
    return mode === 'percent' ? '15' : '';
  });
  const [autoRearm, setAutoRearm] = useState<boolean>(!!existing?.auto_rearm);
  const [saving, setSaving] = useState(false);

  // When editing, load the trigger history for the alert. Cheap — typically
  // a handful of rows per alert.
  const { data: events } = useQuery<{ at: string; current_price: number }>(
    `SELECT at, current_price
       FROM price_alert_events
      WHERE alert_id = ?
      ORDER BY at DESC
      LIMIT 5`,
    [existing?.id ?? '']
  );

  // Re-seed state when the sheet opens anew or switches alert.
  useEffect(() => {
    if (!visible) return;
    if (existing) {
      setFinish(existing.finish);
      setDirection(existing.direction);
      setMode(existing.mode);
      setRawValue(String(existing.target_value));
      setAutoRearm(!!existing.auto_rearm);
    } else {
      setFinish(availableFinishes[0]);
      setDirection('below');
      setMode('percent');
      setRawValue('15');
      setAutoRearm(false);
    }
  }, [visible, existing, availableFinishes]);

  // Auto re-arm only makes sense in percent mode — in price mode the
  // absolute target stays put after a trigger, so "re-anchoring" the
  // snapshot would just flip-flop the alert around the same price. If
  // the user switches mode to price, force-disable the toggle.
  useEffect(() => {
    if (mode === 'price' && autoRearm) setAutoRearm(false);
  }, [mode, autoRearm]);

  const currentPrice = useMemo(() => {
    if (!card) return existing?.snapshot_price ?? null;
    return priceFromCard(card, finish);
  }, [card, finish, existing]);

  const snapshotPrice = existing?.snapshot_price ?? currentPrice;

  const parsedValue = useMemo(() => {
    const n = parseFloat(rawValue.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [rawValue]);

  const targetUsd = useMemo(() => {
    if (parsedValue == null || snapshotPrice == null) return null;
    return computeTargetUsd(snapshotPrice, mode, direction, parsedValue);
  }, [parsedValue, snapshotPrice, mode, direction]);

  // Validation: "Below $X" only makes sense if X < current price, and "Above"
  // only if > current. For percent mode, the sign is implicit (we take
  // abs()), so any positive % is valid on either side.
  const validationError = useMemo<string | null>(() => {
    if (parsedValue == null) return null;
    if (snapshotPrice == null) return null;
    if (mode === 'price') {
      if (direction === 'below' && parsedValue >= snapshotPrice) {
        return `Below must be lower than current price (${formatUSD(snapshotPrice)}).`;
      }
      if (direction === 'above' && parsedValue <= snapshotPrice) {
        return `Above must be higher than current price (${formatUSD(snapshotPrice)}).`;
      }
    } else {
      // percent mode
      if (parsedValue <= 0) return 'Percent must be greater than 0.';
      if (direction === 'below' && parsedValue >= 100) {
        return 'Below % must be less than 100.';
      }
    }
    return null;
  }, [parsedValue, snapshotPrice, mode, direction]);

  const preview = useMemo(() => {
    if (parsedValue == null || snapshotPrice == null || targetUsd == null) {
      return 'Enter a target to preview';
    }
    const verb = direction === 'below' ? 'drops to' : 'rises to';
    if (mode === 'percent') {
      const signed = direction === 'below' ? -parsedValue : parsedValue;
      return `Alert when price ${verb} ${formatUSD(targetUsd)} (${signed > 0 ? '+' : ''}${signed}% from ${formatUSD(snapshotPrice)})`;
    }
    return `Alert when price ${verb} ${formatUSD(targetUsd)} (from ${formatUSD(snapshotPrice)})`;
  }, [parsedValue, snapshotPrice, targetUsd, mode, direction]);

  const canSave =
    parsedValue != null && snapshotPrice != null && !validationError && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit && existing) {
        await updateAlertLocal(existing.id, {
          direction,
          mode,
          targetValue: parsedValue!,
          finish,
          autoRearm,
        });
      } else if (card) {
        await createAlertFromCard({
          card,
          finish,
          direction,
          mode,
          targetValue: parsedValue!,
          snapshotPrice: snapshotPrice!,
          autoRearm,
        });
      }
      onSaved?.();
      onClose();
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to save alert');
    } finally {
      setSaving(false);
    }
  }

  if (!card && !existing) return null;

  const displayName = card?.name ?? existing?.card_name ?? '';
  const displaySet = card?.set_name ?? existing?.card_set.toUpperCase() ?? '';
  const displayNumber = card?.collector_number ?? existing?.card_collector_number ?? '';
  const thumbUri =
    (card ? getCardImageUri(card, 'small') : undefined) ?? existing?.card_image_uri ?? undefined;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={styles.container}>
        {/* Card summary */}
        <View style={styles.header}>
          {thumbUri && (
            <Image
              source={{ uri: thumbUri }}
              style={styles.thumb}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
          )}
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {displaySet} · #{displayNumber}
            </Text>
            <Text style={styles.market}>
              {currentPrice != null ? formatUSD(currentPrice) : '—'}{' '}
              <Text style={styles.marketLabel}>{finish} price</Text>
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Finish */}
        {availableFinishes.length > 1 && (
          <>
            <Text style={styles.label}>Finish</Text>
            <View style={styles.segmented}>
              {availableFinishes.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.segment, finish === f && styles.segmentActive]}
                  onPress={() => setFinish(f)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      finish === f && styles.segmentTextActive,
                    ]}
                  >
                    {capitalize(f)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Direction */}
        <Text style={styles.label}>Direction</Text>
        <View style={styles.segmented}>
          {DIRECTIONS.map((d) => {
            const active = direction === d.key;
            const color = dirColor(d.key);
            return (
              <TouchableOpacity
                key={d.key}
                style={[
                  styles.segment,
                  active && { borderColor: color, backgroundColor: color + '15' },
                ]}
                onPress={() => setDirection(d.key)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={d.key === 'above' ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={active ? color : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.segmentText,
                    active && { color },
                  ]}
                >
                  {d.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mode */}
        <Text style={styles.label}>Target</Text>
        <View style={styles.segmented}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.segment, mode === m.key && styles.segmentActive]}
              onPress={() => setMode(m.key)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.segmentText,
                  mode === m.key && styles.segmentTextActive,
                ]}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Numeric input */}
        <View style={styles.inputRow}>
          <Text style={styles.inputPrefix}>{mode === 'price' ? '$' : ''}</Text>
          <BottomSheetTextInput
            value={rawValue}
            onChangeText={setRawValue}
            placeholder={mode === 'price' ? '0.00' : '15'}
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            style={styles.input}
          />
          <Text style={styles.inputSuffix}>{mode === 'percent' ? '%' : ''}</Text>
        </View>

        {/* Preview / validation */}
        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : (
          <Text style={styles.preview}>{preview}</Text>
        )}

        {/* History (edit mode, only if we have events) */}
        {isEdit && (events?.length ?? 0) > 0 && (
          <View style={styles.historyWrap}>
            <Text style={styles.historyLabel}>
              Triggered {events!.length} time{events!.length === 1 ? '' : 's'}
            </Text>
            {events!.slice(0, 3).map((e, i) => (
              <Text key={i} style={styles.historyRow}>
                {formatDate(e.at)} · {formatUSD(e.current_price)}
              </Text>
            ))}
          </View>
        )}

        {/* Auto re-arm toggle — percent mode only */}
        <TouchableOpacity
          style={[styles.rearmRow, mode === 'price' && styles.rearmRowDisabled]}
          onPress={() => setAutoRearm((v) => !v)}
          disabled={mode === 'price'}
          activeOpacity={0.7}
        >
          <View style={styles.rearmTextWrap}>
            <Text
              style={[
                styles.rearmTitle,
                mode === 'price' && styles.rearmTitleDisabled,
              ]}
            >
              Auto re-arm
            </Text>
            <Text style={styles.rearmHint}>
              {mode === 'price'
                ? 'Only available for percent targets. A fixed-price target would re-trigger around the same price without moving meaningfully.'
                : 'After trigger, re-anchor to the new price and keep watching. Each re-fire requires another move of the same percentage.'}
            </Text>
          </View>
          <View
            style={[
              styles.toggle,
              autoRearm && styles.toggleOn,
              mode === 'price' && styles.toggleDisabled,
            ]}
          >
            <View style={[styles.toggleKnob, autoRearm && styles.toggleKnobOn]} />
          </View>
        </TouchableOpacity>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.cta, !canSave && styles.ctaDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>{isEdit ? 'Save changes' : 'Create alert'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 78,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  headerText: { flex: 1 },
  title: { color: colors.text, fontSize: fontSize.lg, fontWeight: '700' },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  market: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 6 },
  marketLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '500' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segmentActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segmentTextActive: { color: colors.primary },
  segmentHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '500',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  inputPrefix: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '700' },
  inputSuffix: { color: colors.textSecondary, fontSize: fontSize.xl, fontWeight: '700' },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '700',
    paddingVertical: spacing.md,
    textAlign: 'center',
  },
  preview: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: '#C24848',
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  rearmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rearmRowDisabled: { opacity: 0.55 },
  rearmTextWrap: { flex: 1 },
  rearmTitle: { color: colors.text, fontSize: fontSize.md, fontWeight: '600' },
  rearmTitleDisabled: { color: colors.textMuted },
  rearmHint: { color: colors.textMuted, fontSize: fontSize.xs, marginTop: 2 },
  toggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.primary },
  toggleDisabled: { opacity: 0.5 },
  toggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  toggleKnobOn: { transform: [{ translateX: 18 }] },
  historyWrap: {
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
  },
  historyLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  historyRow: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '700' },
});
