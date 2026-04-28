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
import { BottomSheet } from './BottomSheet';
import { BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { PrimaryCTA } from './PrimaryCTA';
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
        {/* Sheet chrome */}
        <View style={styles.chromeRow}>
          <Text style={styles.chromeTitle}>{isEdit ? 'Edit alert' : 'Create alert'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.cancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

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
            <Text style={styles.title} numberOfLines={2}>{displayName}</Text>
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
          <View style={styles.field}>
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
          </View>
        )}

        {/* Direction — colored when active so the up/down semantics are
            obvious at a glance (above = green, below = red). */}
        <View style={styles.field}>
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
                    active && { backgroundColor: color + '1A' },
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
                      active && { color, fontWeight: '700' },
                    ]}
                  >
                    {d.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Mode + numeric input — grouped so the value field sits right
            below the mode chooser and the prefix/suffix stay reserved
            (always rendered, hidden via opacity) so the digits don't
            jump when toggling between $ and %. */}
        <View style={styles.field}>
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

          <View style={styles.inputRow}>
            <Text style={[styles.inputAffix, mode !== 'price' && styles.inputAffixHidden]}>$</Text>
            <BottomSheetTextInput
              value={rawValue}
              onChangeText={setRawValue}
              placeholder={mode === 'price' ? '0.00' : '15'}
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              style={styles.input}
            />
            <Text style={[styles.inputAffix, mode !== 'percent' && styles.inputAffixHidden]}>%</Text>
          </View>
        </View>

        {/* Preview / validation */}
        {validationError ? (
          <Text style={styles.errorText}>{validationError}</Text>
        ) : (
          <Text style={styles.preview}>{preview}</Text>
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
        <PrimaryCTA
          variant="solid"
          style={styles.cta}
          label={isEdit ? 'Save changes' : 'Create alert'}
          onPress={handleSave}
          loading={saving}
          disabled={!canSave}
        />
      </View>
    </BottomSheet>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chromeTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  cancel: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 78,
    borderRadius: borderRadius.sm + 2,
    backgroundColor: colors.surfaceSecondary,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: { color: colors.textSecondary, fontSize: fontSize.sm, marginTop: 2 },
  market: { color: colors.text, fontSize: fontSize.md, fontWeight: '700', marginTop: 6 },
  marketLabel: { color: colors.textMuted, fontSize: fontSize.xs, fontWeight: '500' },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  field: {
    gap: spacing.sm,
  },
  label: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  segmentActive: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.sm + 2,
    paddingHorizontal: spacing.sm + 2,
    backgroundColor: colors.surfaceSecondary,
  },
  inputAffix: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    width: 18,
    textAlign: 'center',
  },
  inputAffixHidden: {
    opacity: 0,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: -0.3,
    paddingVertical: spacing.sm + 2,
    textAlign: 'center',
  },
  preview: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.sm,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '600',
  },
  rearmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rearmRowDisabled: { opacity: 0.55 },
  rearmTextWrap: { flex: 1 },
  rearmTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  rearmTitleDisabled: { color: colors.textMuted },
  rearmHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 2,
    fontWeight: '500',
  },
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
  cta: {
    minHeight: 44,
    marginTop: spacing.xs,
  },
});
