import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const { textRecognition } = useTextRecognition({ language: 'LATIN' });

  const {
    detection,
    handleOCRText,
    selectCandidate,
    setDetectionCondition,
    cycleFinish,
    incrementQuantity,
    resetQuantity,
    confirmDetection,
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

  const onTextDetected = useRunOnJS(handleOCRText, [handleOCRText]);

  // Pause frame processor when: not active, detecting, searching, or tray expanded
  const shouldProcess =
    isActive &&
    detection.status === 'scanning' &&
    !trayExpanded;

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
        frameProcessor={shouldProcess ? frameProcessor : undefined}
      />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Text style={styles.title}>Scan</Text>
        {trayCount > 0 && (
          <TouchableOpacity
            style={styles.trayBadge}
            onPress={() => setTrayExpanded(!trayExpanded)}
          >
            <Ionicons name="layers" size={16} color="#FFFFFF" />
            <Text style={styles.trayBadgeText}>{trayCount}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Guide overlay */}
      {detection.status !== 'detected' && !trayExpanded && (
        <ScanOverlay status={detection.status} />
      )}

      {/* Detection bar */}
      {detection.status === 'detected' && detection.card && !trayExpanded && (
        <DetectionBar
          card={detection.card}
          condition={detection.condition}
          finish={detection.finish}
          quantity={detection.quantity}
          onConditionChange={setDetectionCondition}
          onCycleFinish={cycleFinish}
          onIncrementQty={incrementQuantity}
          onResetQty={resetQuantity}
          onConfirm={confirmDetection}
          onDismiss={dismissDetection}
        />
      )}

      {/* Scan tray */}
      {detection.status !== 'detected' && (
        <ScanTray
          items={trayItems}
          expanded={trayExpanded}
          onToggleExpand={() => setTrayExpanded(!trayExpanded)}
          isSaving={isSaving}
          onEdit={(id) => removeTrayItem(id)}
          onDelete={removeTrayItem}
          onClear={clearTray}
          onAddTo={openDestinationPicker}
          bottomInset={insets.bottom}
        />
      )}

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
