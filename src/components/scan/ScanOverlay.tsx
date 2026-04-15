import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import { DetectionStatus } from './useScanState';

type Props = {
  status: DetectionStatus;
};

export function ScanOverlay({ status }: Props) {
  if (status === 'detected') return null;

  return (
    <View style={styles.container}>
      {status === 'scanning' && (
        <>
          <View style={styles.guideFrame} />
          <Text style={styles.guideText}>Point camera at a Magic card</Text>
        </>
      )}

      {status === 'searching' && (
        <>
          <View style={[styles.guideFrame, styles.guideFrameActive]} />
          <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
          <Text style={styles.guideText}>Identifying card...</Text>
        </>
      )}

      {status === 'no_match' && (
        <>
          <View style={[styles.guideFrame, styles.guideFrameError]} />
          <Text style={styles.guideText}>Card not recognized — adjusting...</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideFrame: {
    width: 260,
    height: 364,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderStyle: 'dashed',
  },
  guideFrameActive: {
    borderColor: colors.primary,
    borderStyle: 'solid',
  },
  guideFrameError: {
    borderColor: 'rgba(239,68,68,0.6)',
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
