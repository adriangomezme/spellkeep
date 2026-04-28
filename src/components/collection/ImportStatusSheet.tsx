import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from '../BottomSheet';
import { useImportJob, type ImportJob } from './ImportJobProvider';
import { colors, spacing, fontSize, borderRadius } from '../../constants';
import { PrimaryCTA } from '../PrimaryCTA';

// Global sheet that renders whenever there is an active (non-minimized)
// import job. Owns the live-progress and completed/failed views so tapping
// the MinimizedImportPill can always re-open them.

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

function ImportProgressView({
  job,
  onMinimize,
}: {
  job: ImportJob;
  onMinimize: () => void;
}) {
  const percent =
    job.total > 0 ? Math.min(100, Math.round((job.current / job.total) * 100)) : 0;

  return (
    <View style={styles.progressContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Importing</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Into <Text style={styles.subtitleBold}>{job.collectionName}</Text>
          </Text>
        </View>
        <TouchableOpacity
          style={styles.minimizeBtn}
          onPress={onMinimize}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-down" size={16} color={colors.primary} />
          <Text style={styles.minimizeText}>Minimize</Text>
        </TouchableOpacity>
      </View>

      {/* Phase + counts + bar */}
      <View style={styles.progressBlock}>
        <Text style={styles.progressPhase}>{phaseLabel(job.phase)}</Text>
        <View style={styles.progressMeta}>
          <Text style={styles.progressCounts}>
            {job.current.toLocaleString()} of {job.total.toLocaleString()}
          </Text>
          <Text style={styles.progressPercent}>{percent}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%` }]} />
        </View>
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
  const hasPartialFailures = !isFailed && failedCount > 0;

  function savedVariants(r: typeof result) {
    if (!r) return 0;
    return (r.imported_variants ?? 0) + (r.updated_variants ?? 0);
  }

  const tint = isFailed
    ? colors.error
    : hasPartialFailures
      ? colors.warning
      : colors.success;
  const tintBg = isFailed
    ? colors.errorLight
    : hasPartialFailures
      ? colors.warningLight
      : colors.successLight;
  const iconName = isFailed
    ? 'alert-circle'
    : hasPartialFailures
      ? 'checkmark-done'
      : 'checkmark-circle';

  return (
    <View style={styles.resultContainer}>
      {/* Header (close right) */}
      <View style={styles.resultHeader}>
        <View style={{ width: 24 }} />
        <TouchableOpacity
          onPress={onMinimize}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-down" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={[styles.resultIcon, { backgroundColor: tintBg }]}>
        <Ionicons name={iconName} size={36} color={tint} />
      </View>

      <Text style={styles.resultTitle}>
        {isFailed ? 'Import failed' : 'Import complete'}
      </Text>

      {isFailed ? (
        <Text style={styles.resultSubtitle}>{job.error ?? 'Something went wrong.'}</Text>
      ) : (
        <Text style={styles.resultSubtitle}>
          <Text style={styles.resultSubtitleBold}>{saved.toLocaleString()}</Text>
          {' cards · '}
          <Text style={styles.resultSubtitleBold}>{savedVariants(result).toLocaleString()}</Text>
          {' unique saved to '}
          <Text style={styles.resultSubtitleBold}>{job.collectionName}</Text>
        </Text>
      )}

      {!isFailed && (
        <View style={styles.statsRow}>
          <ResultStat label="Imported" value={result?.imported ?? 0} />
          <View style={styles.statsDivider} />
          <ResultStat label="Updated" value={result?.updated ?? 0} />
          <View style={styles.statsDivider} />
          <ResultStat
            label="Failed"
            value={failedCount}
            accent={failedCount > 0 ? colors.warning : undefined}
          />
        </View>
      )}

      {!isFailed && failedCount > 0 && result && (
        <View style={styles.failedWrap}>
          <Text style={styles.failedHeader}>Cards we couldn't match</Text>
          <ScrollView style={styles.failedList} nestedScrollEnabled>
            {result.failed.slice(0, 50).map((name, i) => (
              <Text key={`${name}_${i}`} style={styles.failedItem} numberOfLines={1}>
                {name}
              </Text>
            ))}
            {failedCount > 50 && (
              <Text style={styles.failedMore}>…and {failedCount - 50} more</Text>
            )}
          </ScrollView>
        </View>
      )}

      <PrimaryCTA
        variant="solid"
        style={styles.cta}
        label={isFailed ? 'Close' : 'Done'}
        onPress={onDone}
      />
    </View>
  );
}

function ResultStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
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
  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginTop: 2,
  },
  subtitleBold: {
    color: colors.text,
    fontWeight: '700',
  },
  minimizeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primaryLight,
  },
  minimizeText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // ── Progress view ─────────────────────────────────────────────────
  progressContainer: {
    paddingBottom: spacing.sm,
  },
  progressBlock: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  progressPhase: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  progressCounts: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  progressPercent: {
    color: colors.primary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  progressHint: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    fontWeight: '500',
  },

  // ── Result view ───────────────────────────────────────────────────
  resultContainer: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  resultIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultTitle: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: spacing.xs,
  },
  resultSubtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  resultSubtitleBold: {
    color: colors.text,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  failedWrap: {
    alignSelf: 'stretch',
    marginBottom: spacing.md,
  },
  failedHeader: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  failedList: {
    maxHeight: 160,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  failedItem: {
    color: colors.text,
    fontSize: fontSize.sm,
    paddingVertical: 2,
  },
  failedMore: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  cta: {
    minHeight: 44,
    alignSelf: 'stretch',
  },
});
