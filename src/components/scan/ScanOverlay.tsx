import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import { DetectionStatus } from './useScanState';

type Props = {
  status: DetectionStatus;
};

export function ScanOverlay({ status }: Props) {
  return (
    <View style={styles.container} pointerEvents="none">
      <View
        style={[
          styles.guideFrame,
          status === 'searching' && styles.guideFrameSearching,
          status === 'no_match' && styles.guideFrameError,
        ]}
      />
      {(status === 'scanning' || status === 'detected') && (
        <Text style={styles.guideText}>Point camera at a Magic card</Text>
      )}
      {status === 'searching' && (
        <>
          <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
          <Text style={styles.guideText}>Identifying card...</Text>
        </>
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
    width: 260,
    height: 364,
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
