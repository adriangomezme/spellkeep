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
    setDetectionQuantity,
    confirmDetection,
    dismissDetection,
    trayItems,
    trayCount,
    editTrayItem,
    removeTrayItem,
    clearTray,
    showDestinationPicker,
    openDestinationPicker,
    closeDestinationPicker,
    addAllToDestination,
    isSaving,
  } = useScanState();

  // Bridge from worklet to JS thread
  const onTextDetected = useRunOnJS(handleOCRText, [handleOCRText]);

  // Frame processor pauses during detection or searching
  const shouldProcess = isActive && detection.status === 'scanning';

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(2, () => {
        'worklet';
        const result = textRecognition(frame);
        if (result?.text && result.text.length > 10) {
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
      {/* Camera */}
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
          <View style={styles.trayBadge}>
            <Text style={styles.trayBadgeText}>{trayCount}</Text>
          </View>
        )}
      </View>

      {/* Guide overlay (when scanning or searching) */}
      {detection.status !== 'detected' && (
        <ScanOverlay status={detection.status} />
      )}

      {/* Detection bar (when card found) */}
      {detection.status === 'detected' && detection.card && (
        <DetectionBar
          card={detection.card}
          condition={detection.condition}
          quantity={detection.quantity}
          onConditionChange={setDetectionCondition}
          onQuantityChange={setDetectionQuantity}
          onConfirm={confirmDetection}
          onDismiss={dismissDetection}
        />
      )}

      {/* Scan tray (when items accumulated, not during detection) */}
      {detection.status !== 'detected' && (
        <ScanTray
          items={trayItems}
          isSaving={isSaving}
          onEdit={(id) => {
            // For now, remove and let them re-scan. Full inline edit is Day-2.
            removeTrayItem(id);
          }}
          onDelete={removeTrayItem}
          onClear={clearTray}
          onAddTo={openDestinationPicker}
          bottomInset={insets.bottom}
        />
      )}

      {/* Destination picker modal */}
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
    backgroundColor: colors.primary,
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  trayBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.sm,
    fontWeight: '700',
  },
});
