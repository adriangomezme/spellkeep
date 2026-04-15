import { useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Animated, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import { DetectionStatus } from './useScanState';

type Props = {
  status: DetectionStatus;
  successFlash?: boolean;
};

export function ScanOverlay({ status, successFlash }: Props) {
  const flashOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (successFlash) {
      flashOpacity.setValue(1);
      Animated.timing(flashOpacity, {
        toValue: 0,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }
  }, [successFlash]);

  return (
    <View style={styles.container} pointerEvents="none">
      {/* Base guide frame */}
      <View
        style={[
          styles.guideFrame,
          status === 'searching' && styles.guideFrameSearching,
          status === 'no_match' && styles.guideFrameError,
        ]}
      />
      {/* Green flash overlay on success */}
      <Animated.View
        style={[
          styles.guideFrame,
          styles.guideFrameSuccess,
          styles.flashOverlay,
          { opacity: flashOpacity },
        ]}
      />

      {status === 'searching' && (
        <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
      )}
      {(status === 'scanning' || status === 'detected') && (
        <Text style={styles.guideText}>Point camera at a Magic card</Text>
      )}
      {status === 'searching' && (
        <Text style={styles.guideText}>Identifying card...</Text>
      )}
      {status === 'no_match' && (
        <Text style={styles.guideText}>Card not recognized</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideFrame: {
    width: 300,
    height: 419,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    borderStyle: 'dashed',
  },
  guideFrameSearching: {
    borderColor: colors.primary,
    borderStyle: 'solid',
  },
  guideFrameError: {
    borderColor: 'rgba(239,68,68,0.5)',
  },
  guideFrameSuccess: {
    borderColor: 'rgba(34,197,94,0.8)',
    borderStyle: 'solid',
    borderWidth: 3,
  },
  flashOverlay: {
    position: 'absolute',
  },
  spinner: {
    position: 'absolute',
  },
  guideText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: fontSize.md,
    fontWeight: '500',
    marginTop: spacing.md,
  },
});
