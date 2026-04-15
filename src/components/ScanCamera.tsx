import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
  runAsync,
} from 'react-native-vision-camera';
import { useTextRecognition } from 'react-native-vision-camera-mlkit';
import { useRunOnJS } from 'react-native-worklets-core';
import {
  ScryfallCard,
  getCardImageUri,
  formatPrice,
} from '../lib/scryfall';
import { matchCard, extractCardName } from '../lib/card-matcher';
import { AddToCollectionModal } from './AddToCollectionModal';
import { colors, shadows, spacing, fontSize, borderRadius } from '../constants';

type ScanState = 'camera' | 'searching' | 'result' | 'no_match';

export function ScanCamera() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();

  const [scanState, setScanState] = useState<ScanState>('camera');
  const [matchedCards, setMatchedCards] = useState<ScryfallCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<ScryfallCard | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const lastDetectedRef = useRef('');
  const isProcessingRef = useRef(false);

  const { textRecognition } = useTextRecognition({ language: 'LATIN' });

  const handleDetection = useCallback(async (text: string) => {
    if (isProcessingRef.current) return;
    if (!text || text.length < 3) return;

    const cardName = extractCardName(text);
    if (!cardName || cardName.length < 3) return;
    if (cardName === lastDetectedRef.current) return;

    isProcessingRef.current = true;
    lastDetectedRef.current = cardName;
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
  }, []);

  // Bridge from worklet thread to JS thread
  const onTextDetected = useRunOnJS(handleDetection, [handleDetection]);

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      runAtTargetFps(2, () => {
        'worklet';
        const result = textRecognition(frame);
        if (result?.text && result.text.length > 3) {
          onTextDetected(result.text);
        }
      });
    },
    [textRecognition, onTextDetected]
  );

  function resetScan() {
    setScanState('camera');
    setMatchedCards([]);
    setSelectedCard(null);
    lastDetectedRef.current = '';
    isProcessingRef.current = false;
  }

  // Request permission
  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <View style={styles.emptyIcon}>
          <Ionicons name="camera-outline" size={40} color={colors.textMuted} />
        </View>
        <Text style={styles.titleText}>Camera Access Required</Text>
        <Text style={styles.subtitleText}>
          Allow camera access to scan Magic cards
        </Text>
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>Grant Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.titleText}>No camera found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={scanState === 'camera'}
        frameProcessor={scanState === 'camera' ? frameProcessor : undefined}
      />

      {/* Overlay */}
      <View style={[styles.overlay, { paddingTop: insets.top }]}>
        <View style={styles.topBar}>
          <Text style={styles.scanTitle}>Scan Card</Text>
        </View>

        {scanState === 'camera' && (
          <View style={styles.guideContainer}>
            <View style={styles.guideFrame} />
            <Text style={styles.guideText}>Point camera at a Magic card</Text>
          </View>
        )}

        {scanState === 'searching' && (
          <View style={styles.guideContainer}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.guideText}>Identifying card...</Text>
          </View>
        )}

        {scanState === 'no_match' && (
          <View style={styles.guideContainer}>
            <View style={styles.noMatchCard}>
              <Ionicons name="help-circle-outline" size={32} color={colors.textMuted} />
              <Text style={styles.noMatchTitle}>Card not recognized</Text>
              <Text style={styles.noMatchSubtitle}>Try adjusting the angle or lighting</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={resetScan}>
                <Text style={styles.primaryButtonText}>Try Again</Text>
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

          {matchedCards.length > 1 && (
            <View style={styles.otherMatches}>
              <Text style={styles.otherLabel}>Other matches:</Text>
              <View style={styles.otherRow}>
                {matchedCards.slice(1, 4).map((card: ScryfallCard) => (
                  <TouchableOpacity
                    key={card.id}
                    style={styles.otherItem}
                    onPress={() => setSelectedCard(card)}
                  >
                    <Image
                      source={{ uri: getCardImageUri(card, 'small') }}
                      style={styles.otherImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.resultActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Add to Collection</Text>
            </TouchableOpacity>
            <View style={styles.secondaryRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  router.push({
                    pathname: '/card/[id]',
                    params: { id: selectedCard.id, cardJson: JSON.stringify(selectedCard) },
                  });
                }}
              >
                <Ionicons name="information-circle-outline" size={18} color={colors.text} />
                <Text style={styles.secondaryText}>Details</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={resetScan}>
                <Ionicons name="scan-outline" size={18} color={colors.text} />
                <Text style={styles.secondaryText}>Scan Again</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {selectedCard && (
        <AddToCollectionModal
          visible={showAddModal}
          card={selectedCard}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            Alert.alert('Added!', `${selectedCard.name} added to your collection`);
            resetScan();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
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
  titleText: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  subtitleText: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.sm,
    textAlign: 'center',
    marginBottom: spacing.lg,
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
  noMatchSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.md,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
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
  otherLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  otherRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  otherItem: {
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  otherImage: {
    width: 40,
    height: 56,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surfaceSecondary,
  },
  resultActions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  secondaryRow: {
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
  secondaryText: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
});
