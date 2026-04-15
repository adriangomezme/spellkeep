import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ScryfallCard, getCardImageUri, formatPrice } from '../../src/lib/scryfall';
import { matchCard, extractCardName } from '../../src/lib/card-matcher';
import { AddToCollectionModal } from '../../src/components/AddToCollectionModal';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../src/constants';

// Web fallback
if (Platform.OS === 'web') {
  module.exports = require('../../src/components/ScreenPlaceholder');
}

type ScanState = 'camera' | 'searching' | 'result' | 'no_match';

function ScanScreenNative() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanState, setScanState] = useState<ScanState>('camera');
  const [matchedCards, setMatchedCards] = useState<ScryfallCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [lastOcrText, setLastOcrText] = useState('');
  const isProcessingRef = useRef(false);

  // Dynamically import native modules
  const [CameraModule, setCameraModule] = useState<any>(null);
  const [OcrModule, setOcrModule] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const cam = require('react-native-vision-camera');
        const ocr = require('react-native-vision-camera-mlkit');

        setCameraModule(cam);
        setOcrModule(ocr);

        const status = await cam.Camera.requestCameraPermission();
        setHasPermission(status === 'granted');
      } catch (err) {
        console.error('Camera module error:', err);
        setHasPermission(false);
      }
    })();
  }, []);

  const handleOcrResult = useCallback(async (text: string) => {
    if (isProcessingRef.current) return;
    if (!text || text.length < 3) return;

    const cardName = extractCardName(text);
    if (!cardName || cardName.length < 3) return;

    // Avoid re-processing the same text
    if (cardName === extractCardName(lastOcrText)) return;

    isProcessingRef.current = true;
    setLastOcrText(text);
    setScanState('searching');

    try {
      const matches = await matchCard(text);
      if (matches.length > 0) {
        setMatchedCards(matches);
        setSelectedCard(matches[0]);
        setScanState('result');
      } else {
        setScanState('no_match');
      }
    } catch {
      setScanState('no_match');
    } finally {
      isProcessingRef.current = false;
    }
  }, [lastOcrText]);

  function resetScan() {
    setScanState('camera');
    setMatchedCards([]);
    setSelectedCard(null);
    setLastOcrText('');
    isProcessingRef.current = false;
  }

  // Permission states
  if (hasPermission === null) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.emptyIcon}>
          <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          Allow camera access to scan Magic cards
        </Text>
      </View>
    );
  }

  if (!CameraModule || !OcrModule) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const { Camera, useCameraDevice, useFrameProcessor } = CameraModule;
  const { useTextRecognition } = OcrModule;

  return (
    <ScanCameraView
      Camera={Camera}
      useCameraDevice={useCameraDevice}
      useFrameProcessor={useFrameProcessor}
      useTextRecognition={useTextRecognition}
      scanState={scanState}
      selectedCard={selectedCard}
      matchedCards={matchedCards}
      showAddModal={showAddModal}
      insets={insets}
      onOcrResult={handleOcrResult}
      onReset={resetScan}
      onAddToCollection={() => setShowAddModal(true)}
      onCloseAddModal={() => setShowAddModal(false)}
      onAddSuccess={() => {
        setShowAddModal(false);
        Alert.alert('Added!', `${selectedCard?.name} added to your collection`);
        resetScan();
      }}
      onViewDetail={() => {
        if (!selectedCard) return;
        router.push({
          pathname: '/card/[id]',
          params: { id: selectedCard.id, cardJson: JSON.stringify(selectedCard) },
        });
      }}
      onSelectCard={setSelectedCard}
    />
  );
}

function ScanCameraView({
  Camera,
  useCameraDevice,
  useFrameProcessor,
  useTextRecognition,
  scanState,
  selectedCard,
  matchedCards,
  showAddModal,
  insets,
  onOcrResult,
  onReset,
  onAddToCollection,
  onCloseAddModal,
  onAddSuccess,
  onViewDetail,
  onSelectCard,
}: any) {
  const device = useCameraDevice('back');
  const { textRecognition } = useTextRecognition({ language: 'LATIN' });

  const frameProcessor = useFrameProcessor(
    (frame: any) => {
      'worklet';
      if (scanState !== 'camera') return;

      const { runAtTargetFps, runAsync } = require('react-native-vision-camera');

      runAtTargetFps(2, () => {
        'worklet';
        runAsync(frame, () => {
          'worklet';
          const result = textRecognition(frame);
          if (result?.text) {
            onOcrResult(result.text);
          }
        });
      });
    },
    [textRecognition, scanState, onOcrResult]
  );

  if (!device) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
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
        isActive={scanState === 'camera'}
        frameProcessor={frameProcessor}
      />

      {/* Overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Text style={styles.scanTitle}>Scan Card</Text>
        </View>

        {/* Guide frame */}
        {scanState === 'camera' && (
          <View style={styles.guideContainer}>
            <View style={styles.guideFrame} />
            <Text style={styles.guideText}>Point camera at a Magic card</Text>
          </View>
        )}

        {/* Searching indicator */}
        {scanState === 'searching' && (
          <View style={styles.searchingContainer}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.searchingText}>Identifying card...</Text>
          </View>
        )}

        {/* No match */}
        {scanState === 'no_match' && (
          <View style={styles.noMatchContainer}>
            <View style={styles.noMatchCard}>
              <Ionicons name="help-circle-outline" size={32} color={colors.textMuted} />
              <Text style={styles.noMatchTitle}>Card not recognized</Text>
              <Text style={styles.noMatchText}>Try adjusting the angle or lighting</Text>
              <TouchableOpacity style={styles.retryButton} onPress={onReset}>
                <Text style={styles.retryText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Result bottom sheet */}
      {scanState === 'result' && selectedCard && (
        <View style={[styles.resultSheet, { paddingBottom: insets.bottom + 90 }]}>
          <View style={styles.resultCard}>
            <Image
              source={{ uri: getCardImageUri(selectedCard, 'small') }}
              style={styles.resultImage}
              contentFit="cover"
            />
            <View style={styles.resultInfo}>
              <Text style={styles.resultName} numberOfLines={1}>{selectedCard.name}</Text>
              <Text style={styles.resultSet} numberOfLines={1}>
                {selectedCard.set_name} #{selectedCard.collector_number}
              </Text>
              <Text style={styles.resultPrice}>{formatPrice(selectedCard.prices?.usd)}</Text>
            </View>
          </View>

          {/* Other matches */}
          {matchedCards.length > 1 && (
            <View style={styles.otherMatches}>
              <Text style={styles.otherMatchesLabel}>Other matches:</Text>
              <View style={styles.otherMatchesRow}>
                {matchedCards.slice(1, 4).map((card: ScryfallCard) => (
                  <TouchableOpacity
                    key={card.id}
                    style={styles.otherMatchItem}
                    onPress={() => onSelectCard(card)}
                  >
                    <Image
                      source={{ uri: getCardImageUri(card, 'small') }}
                      style={styles.otherMatchImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.resultActions}>
            <TouchableOpacity style={styles.addButton} onPress={onAddToCollection}>
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add to Collection</Text>
            </TouchableOpacity>
            <View style={styles.secondaryActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={onViewDetail}>
                <Ionicons name="information-circle-outline" size={20} color={colors.text} />
                <Text style={styles.secondaryButtonText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={onReset}>
                <Ionicons name="scan-outline" size={20} color={colors.text} />
                <Text style={styles.secondaryButtonText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Add to Collection Modal */}
      {selectedCard && (
        <AddToCollectionModal
          visible={showAddModal}
          card={selectedCard}
          onClose={onCloseAddModal}
          onSuccess={onAddSuccess}
        />
      )}
    </View>
  );
}

export default function ScanScreen() {
  if (Platform.OS === 'web') {
    const { ScreenPlaceholder } = require('../../src/components/ScreenPlaceholder');
    return (
      <ScreenPlaceholder
        title="Scan"
        icon="scan"
        subtitle="Camera scanning is only available on mobile devices"
      />
    );
  }

  return <ScanScreenNative />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIcon: {
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
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  scanTitle: {
    color: '#FFFFFF',
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  guideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideFrame: {
    width: 260,
    height: 364,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderStyle: 'dashed',
  },
  guideText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.md,
    marginTop: spacing.md,
  },
  searchingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchingText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    marginTop: spacing.md,
  },
  noMatchContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  noMatchCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.lg,
  },
  noMatchTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: spacing.sm,
  },
  noMatchText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  resultSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    ...shadows.lg,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultImage: {
    width: 56,
    height: 78,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  resultInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  resultName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  resultSet: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    marginTop: 2,
  },
  resultPrice: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  otherMatches: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.divider,
  },
  otherMatchesLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  otherMatchesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  otherMatchItem: {
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  otherMatchImage: {
    width: 40,
    height: 56,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  resultActions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    gap: spacing.xs,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
