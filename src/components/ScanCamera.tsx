import { useState, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard } from '../lib/scryfall';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
} from 'react-native-vision-camera';
import { useTextRecognition } from 'react-native-vision-camera-mlkit';
import { useRunOnJS } from 'react-native-worklets-core';

import { useScanState } from './scan/useScanState';
import { ScanOverlay } from './scan/ScanOverlay';
import { DetectionBar } from './scan/DetectionBar';
import { ScanTray } from './scan/ScanTray';
import { DestinationPicker } from './scan/DestinationPicker';
import { colors, spacing, fontSize, borderRadius } from '../constants';

/**
 * Filters OCR text to only include blocks that fall within the center
 * region of the frame (where the guide frame is). This prevents reading
 * text from keyboards, table edges, or other cards in the background.
 *
 * Since ML Kit text recognition returns raw text without position data
 * through the frame processor plugin, we use a heuristic: only process
 * the text if it contains enough MTG-like structure. The validateMTGLayout
 * in card-matcher.ts handles this filtering.
 *
 * Additionally, we require a minimum text length to avoid false triggers
 * from short fragments.
 */
const MIN_OCR_TEXT_LENGTH = 20;

type Props = {
  isActive: boolean;
};

export function ScanCamera({ isActive }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const { textRecognition } = useTextRecognition({ language: 'LATIN' });

  const {
    detection,
    successCount,
    pausedRef,
    handleOCRText,
    setDetectionCondition,
    cycleFinish,
    incrementQuantity,
    resetQuantity,
    changeVersion,
    dismissDetection,
    trayItems,
    trayCount,
    trayExpanded,
    setTrayExpanded,
    editTrayItem,
    removeTrayItem,
    clearTray,
    showDestinationPicker,
    openDestinationPicker,
    closeDestinationPicker,
    addAllToDestination,
    isSaving,
  } = useScanState();

  const [showVersionPicker, setShowVersionPicker] = useState(false);

  const onTextDetected = useRunOnJS(handleOCRText, [handleOCRText]);

  // Pause OCR when tray or version picker is open
  pausedRef.current = !isActive || trayExpanded || showVersionPicker;

  const navigateToCard = useCallback((card: ScryfallCard) => {
    router.push({
      pathname: '/card/[id]',
      params: { id: card.id, cardJson: JSON.stringify(card) },
    });
  }, [router]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(2, () => {
        'worklet';
        const result = textRecognition(frame);
        if (result?.text && result.text.length > MIN_OCR_TEXT_LENGTH) {
          onTextDetected(result.text);
        }
      });
    },
    [textRecognition, onTextDetected]
  );

  // Permission screen
  if (!hasPermission) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top }]}>
        <View style={styles.permissionIcon}>
          <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          Allow camera access to scan Magic cards
        </Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.permissionContainer, { paddingTop: insets.top }]}>
        <Text style={styles.permissionTitle}>No camera found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Scan</Text>
        <TouchableOpacity
          style={styles.trayBadge}
          onPress={() => setTrayExpanded(true)}
        >
          <Ionicons name="layers" size={16} color="#FFFFFF" />
          {trayCount > 0 && <Text style={styles.trayBadgeText}>{trayCount}</Text>}
        </TouchableOpacity>
      </View>

      {/* Guide overlay — always visible */}
      <ScanOverlay status={detection.status} successFlash={successCount > 0} key={successCount} />

      {/* Dark overlay when version picker or tray is open */}
      {(showVersionPicker || trayExpanded) && <View style={styles.cameraOverlay} />}

      {/* Detection bar — visible whenever there's a card (persists during searching) */}
      {detection.card && (
        <DetectionBar
          card={detection.card}
          condition={detection.condition}
          finish={detection.finish}
          quantity={detection.quantity}
          onConditionChange={setDetectionCondition}
          onCycleFinish={cycleFinish}
          onIncrementQty={incrementQuantity}
          onResetQty={resetQuantity}
          onVersionChange={changeVersion}
          onCardPress={() => detection.card && navigateToCard(detection.card)}
          showVersionPicker={showVersionPicker}
          onOpenVersionPicker={() => setShowVersionPicker(true)}
          onCloseVersionPicker={() => setShowVersionPicker(false)}
        />
      )}

      {/* Scan tray — full screen modal triggered by badge button */}
      <ScanTray
        items={trayItems}
        visible={trayExpanded}
        onClose={() => setTrayExpanded(false)}
        isSaving={isSaving}
        onEdit={(id) => removeTrayItem(id)}
        onDelete={removeTrayItem}
        onCardPress={(item: any) => navigateToCard(item.card)}
        onClear={clearTray}
        onAddTo={openDestinationPicker}
      />

      {/* Destination picker */}
      <DestinationPicker
        visible={showDestinationPicker}
        cardCount={trayCount}
        onSelect={addAllToDestination}
        onClose={closeDestinationPicker}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 1,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  permissionTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  permissionText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  grantButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  grantText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    color: '#FFFFFF',
    fontSize: fontSize.xxl,
    fontWeight: '800',
    flex: 1,
  },
  trayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  trayBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
