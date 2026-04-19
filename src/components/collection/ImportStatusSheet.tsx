import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { useImportJob, type ImportJob } from './ImportJobProvider';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

// Global sheet that renders whenever there is an active (non-minimized)
// import job. Owns the live-progress and completed/failed views so tapping
// the MinimizedImportPill can always re-open them — earlier the progress
// UI lived inside the per-screen ImportModal, so dismissing that screen
// killed the sheet and the pill tap couldn't bring it back.

function phaseLabel(phase: ImportJob['phase']) {
  switch (phase) {
    case 'parsing':
      return 'Preparing import…';
    case 'resolving':
      return 'Matching cards to your catalog…';
    case 'resolving_online':
      return 'Looking up new cards online…';
    case 'uploading':
      return 'Saving to your collection…';
    case 'done':
      return 'Wrapping up…';
    default:
      return 'Importing…';
  }
}

export function ImportStatusSheet() {
  const { job, minimize, dismiss } = useImportJob();

  const visible = !!job && !job.minimized;

  return (
    <BottomSheet visible={visible} onClose={minimize}>
      {job ? (
        job.status === 'running' ? (
          <ImportProgressView job={job} onMinimize={minimize} />
        ) : (
          <ImportResultView job={job} onDone={dismiss} onMinimize={minimize} />
        )
      ) : (
        <View style={{ height: 1 }} />
      )}
    </BottomSheet>
  );
}

function ImportProgressView({ job, onMinimize }: { job: ImportJob; onMinimize: () => void }) {
  const percent =
    job.total > 0 ? Math.min(100, Math.round((job.current / job.total) * 100)) : 0;

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressTitle}>Importing</Text>
        <TouchableOpacity style={styles.minimizeBtn} onPress={onMinimize}>
          <Ionicons name="chevron-down" size={18} color={colors.primary} />
          <Text style={styles.minimizeText}>Minimize</Text>
        </TouchableOpacity>
      </View>

      <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.lg }} />

      <Text style={styles.progressPhase}>{phaseLabel(job.phase)}</Text>
      <Text style={styles.progressCounts}>
        {job.current.toLocaleString()} of {job.total.toLocaleString()} · {percent}%
      </Text>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${percent}%` }]} />
      </View>

      <Text style={styles.progressHint}>
        You can minimize this and keep using the app. We'll let you know when it's done.
      </Text>
    </View>
  );
}

function ImportResultView({
  job,
  onDone,
  onMinimize,
}: {
  job: ImportJob;
  onDone: () => void;
  onMinimize: () => void;
}) {
  const isFailed = job.status === 'failed';
  const result = job.result;
  const saved = result ? result.imported + result.updated : 0;
  const failedCount = result?.failed.length ?? 0;

  function savedVariants(r: typeof result) {
    if (!r) return 0;
    return (r.imported_variants ?? 0) + (r.updated_variants ?? 0);
  }

  return (
    <View style={styles.resultContainer}>
      <TouchableOpacity style={styles.closeBtn} onPress={onMinimize}>
        <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
      </TouchableOpacity>

      <View
        style={[
          styles.resultIcon,
          {
            backgroundColor: isFailed
              ? colors.errorLight
              : failedCount > 0
              ? colors.warningLight
              : colors.successLight,
          },
        ]}
      >
        <Ionicons
          name={isFailed ? 'alert-circle' : failedCount > 0 ? 'checkmark-done' : 'checkmark-circle'}
          size={40}
          color={isFailed ? colors.error : failedCount > 0 ? colors.warning : colors.success}
        />
      </View>

      <Text style={styles.resultTitle}>
        {isFailed ? 'Import failed' : 'Import complete'}
      </Text>

      {isFailed ? (
        <Text style={styles.resultSubtitle}>{job.error ?? 'Something went wrong.'}</Text>
      ) : (
        <View style={styles.resultStats}>
          <ResultStat label="Imported" value={result?.imported ?? 0} />
          <ResultStat label="Updated" value={result?.updated ?? 0} />
          <ResultStat
            label="Failed"
            value={failedCount}
            accent={failedCount > 0 ? colors.warning : undefined}
          />
        </View>
      )}

      {!isFailed && failedCount > 0 && result && (
        <ScrollView style={styles.failedList}>
          <Text style={styles.failedHeader}>Cards we couldn't match</Text>
          {result.failed.slice(0, 50).map((name, i) => (
            <Text key={`${name}_${i}`} style={styles.failedItem} numberOfLines={1}>
              {name}
            </Text>
          ))}
          {failedCount > 50 && (
            <Text style={styles.failedMore}>…and {failedCount - 50} more</Text>
          )}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.doneButton} onPress={onDone}>
        <Text style={styles.doneButtonText}>{isFailed ? 'Close' : 'Done'}</Text>
      </TouchableOpacity>

      {!isFailed && (
        <Text style={styles.resultHint}>
          {saved.toLocaleString()} cards · {savedVariants(result).toLocaleString()} unique saved to {job.collectionName}
        </Text>
      )}
    </View>
  );
}

function ResultStat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent ? { color: accent } : null]}>
        {value.toLocaleString()}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progressContainer: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  minimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  minimizeText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  progressPhase: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  progressCounts: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  progressHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  resultContainer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  closeBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: spacing.sm,
    zIndex: 1,
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  resultTitle: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  resultSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
  resultStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignSelf: 'stretch',
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  statCell: {
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  failedList: {
    alignSelf: 'stretch',
    maxHeight: 180,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  failedHeader: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  failedItem: {
    color: colors.text,
    fontSize: fontSize.sm,
    paddingVertical: 2,
  },
  failedMore: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
  },
  doneButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  resultHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
  },
});
