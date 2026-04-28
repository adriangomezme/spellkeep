import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, BottomSheetScrollView } from '../BottomSheet';
import { colors, spacing, fontSize, borderRadius } from '../../constants';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

type QuickAction = {
  key: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
};

type Row = {
  key: string;
  label: string;
  subtitle?: string;
  icon: IconName;
  destructive?: boolean;
  trailing?: 'chevron' | 'switch';
  switchValue?: boolean;
};

type Section = {
  label: string;
  rows: Row[];
};

type Props = {
  visible: boolean;
  itemName: string;
  itemType: 'binder' | 'list' | 'folder';
  /** Accent color of the binder/list (used in the header thumbnail). */
  itemColor?: string | null;
  /** Total cards in the collection. Used in the header subtitle. */
  itemCount?: number;
  /** Total monetary value of the collection (binder/list only). */
  itemValue?: number;
  /** % change vs. previous snapshot. When provided, shown as an
   *  accent pill on the header. Mocked until pricing trends ship. */
  itemChangePct?: number;
  /** Whether the item is currently inside a folder */
  inFolder?: boolean;
  /** Whether this item is the current Quick Add target. Drives the
   *  "Quick Add target" toggle. */
  isQuickAddTarget?: boolean;
  /** Hide the Reorder action — used when the sheet is opened from a
   *  context where reordering siblings would be confusing (the folder's
   *  own detail screen, a binder's own detail screen). */
  hideReorder?: boolean;
  /** Whether the "Select cards" option is available. Only true on
   *  binder/list detail when the user is in a grid view (bulk mode
   *  is grid-only by design). */
  canSelectCards?: boolean;
  onAction: (key: string) => void;
  onClose: () => void;
};

const FOLDER_DEFAULT_COLOR = '#A0A8B8';

function formatMoney(v: number): string {
  if (v >= 1000) {
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  return `$${v.toFixed(2)}`;
}

export function CollectionActionSheet({
  visible,
  itemName,
  itemType,
  itemColor,
  itemCount,
  itemValue,
  itemChangePct,
  inFolder,
  isQuickAddTarget,
  hideReorder,
  canSelectCards,
  onAction,
  onClose,
}: Props) {
  const isFolder = itemType === 'folder';
  const accent = itemColor || (isFolder ? FOLDER_DEFAULT_COLOR : colors.primary);

  // ── Quick action grid (top) ─────────────────────────────────────────
  const quickActions: QuickAction[] = [];
  if (isFolder) {
    quickActions.push({ key: 'edit', label: 'Edit', icon: 'create-outline' });
    if (!hideReorder) {
      quickActions.push({ key: 'reorder', label: 'Reorder', icon: 'reorder-three-outline' });
    }
    quickActions.push({ key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true });
  } else {
    quickActions.push(
      { key: 'edit', label: 'Edit', icon: 'create-outline' },
      { key: 'duplicate', label: 'Duplicate', icon: 'copy-outline' },
    );
    if (inFolder) {
      quickActions.push({ key: 'remove-from-folder', label: 'Remove', icon: 'exit-outline' });
    } else {
      quickActions.push({ key: 'move-to-folder', label: 'Move', icon: 'folder-outline' });
    }
  }

  // ── Sections (binder/list only) ─────────────────────────────────────
  const sections: Section[] = [];
  if (!isFolder) {
    const organizeRows: Row[] = [
      ...(hideReorder
        ? []
        : [{
            key: 'reorder',
            label: 'Reorder',
            icon: 'reorder-three-outline' as IconName,
            trailing: 'chevron' as const,
          }]),
      {
        key: 'merge',
        label: 'Merge',
        icon: 'git-merge-outline',
        trailing: 'chevron',
      },
      ...(canSelectCards
        ? [{
            key: 'select-cards',
            label: 'Select cards',
            icon: 'checkbox-outline' as IconName,
            trailing: 'chevron' as const,
          }]
        : []),
      {
        key: isQuickAddTarget ? 'clear-quick-add' : 'set-quick-add',
        label: 'Quick Add target',
        icon: isQuickAddTarget ? 'flash' : 'flash-outline',
        trailing: 'chevron',
      },
    ];
    sections.push({ label: 'Organize', rows: organizeRows });

    sections.push({
      label: 'Data',
      rows: [
        {
          key: 'import',
          label: 'Import cards',
          subtitle: 'From CSV or plain text',
          icon: 'arrow-down-outline',
          trailing: 'chevron',
        },
        {
          key: 'export',
          label: 'Export',
          subtitle: 'To CSV or plain text',
          icon: 'arrow-up-outline',
          trailing: 'chevron',
        },
      ],
    });

    sections.push({
      label: 'Danger zone',
      rows: [
        {
          key: 'empty',
          label: 'Empty',
          icon: 'refresh-outline',
          destructive: true,
          trailing: 'chevron',
        },
        {
          key: 'delete',
          label: 'Delete',
          icon: 'trash-outline',
          destructive: true,
          trailing: 'chevron',
        },
      ],
    });
  }

  const showHeaderBadge = !isFolder && typeof itemChangePct === 'number';
  const headerBadgePositive = (itemChangePct ?? 0) >= 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      snapPoints={[isFolder ? '25%' : '72%']}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          {isFolder ? (
            <View style={[styles.thumb, { backgroundColor: accent + '22' }]}>
              <Ionicons name="folder" size={24} color={accent} />
            </View>
          ) : (
            <View
              style={[
                styles.thumb,
                { backgroundColor: itemColor || colors.border },
              ]}
            >
              <Ionicons
                name={itemType === 'binder' ? 'albums' : 'list'}
                size={22}
                color={itemColor ? 'rgba(255,255,255,0.9)' : colors.textSecondary}
              />
            </View>
          )}
          <View style={styles.headerInfo}>
            <Text style={styles.headerMeta} numberOfLines={1}>
              <Text style={styles.headerMetaCaps}>{itemType.toUpperCase()}</Text>
              {typeof itemCount === 'number' && (
                <Text style={styles.headerMetaSep}>
                  {'  ·  '}
                  <Text style={styles.headerMetaCaps}>
                    {itemCount.toLocaleString('en-US')}{' '}
                    {isFolder
                      ? itemCount === 1 ? 'item' : 'items'
                      : itemCount === 1 ? 'card' : 'cards'}
                  </Text>
                </Text>
              )}
              {typeof itemValue === 'number' && itemValue > 0 && (
                <Text style={styles.headerMetaSep}>
                  {'  ·  '}
                  <Text style={styles.headerMetaValue}>{formatMoney(itemValue)}</Text>
                </Text>
              )}
            </Text>
            <Text style={styles.headerName} numberOfLines={1}>{itemName}</Text>
          </View>
          {showHeaderBadge && (
            <View style={styles.changePill}>
              <Ionicons
                name={headerBadgePositive ? 'arrow-up' : 'arrow-down'}
                size={11}
                color={colors.primary}
              />
              <Text style={styles.changePillText}>
                {Math.abs(itemChangePct ?? 0).toFixed(1)}%
              </Text>
            </View>
          )}
        </View>

        {/* Quick action grid */}
        {quickActions.length > 0 && (
          <View style={styles.quickRow}>
            {quickActions.map((action) => {
              const tint = action.destructive ? colors.error : colors.text;
              return (
                <TouchableOpacity
                  key={action.key}
                  style={styles.quickButton}
                  onPress={() => onAction(action.key)}
                  activeOpacity={0.6}
                >
                  <Ionicons name={action.icon} size={22} color={tint} />
                  <Text style={[styles.quickLabel, { color: tint }]}>{action.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Sections */}
        {sections.map((section) => (
          <View key={section.label} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.label.toUpperCase()}</Text>
            <View style={styles.sectionBody}>
              {section.rows.map((row, idx) => {
                const tint = row.destructive ? colors.error : colors.text;
                const isLast = idx === section.rows.length - 1;
                return (
                  <TouchableOpacity
                    key={row.key}
                    style={[styles.row, !isLast && styles.rowDivider]}
                    onPress={() => onAction(row.key)}
                    activeOpacity={0.6}
                  >
                    <Ionicons name={row.icon} size={20} color={tint} style={styles.rowIcon} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowLabel, { color: tint }]}>{row.label}</Text>
                      {row.subtitle && (
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {row.subtitle}
                        </Text>
                      )}
                    </View>
                    {row.trailing === 'switch' ? (
                      <Switch
                        value={row.switchValue}
                        onValueChange={() => onAction(row.key)}
                        trackColor={{ false: colors.border, true: colors.primary }}
                        thumbColor="#FFFFFF"
                        ios_backgroundColor={colors.border}
                      />
                    ) : (
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.lg,
  },

  // ── Header ────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerMeta: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.textMuted,
    marginBottom: 2,
  },
  headerMetaCaps: {
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  headerMetaValue: {
    color: colors.success,
    letterSpacing: 0.4,
  },
  headerMetaSep: {
    color: colors.textMuted,
  },
  headerName: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  changePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 999,
  },
  changePillText: {
    color: colors.primary,
    fontSize: fontSize.sm,
    fontWeight: '700',
  },

  // ── Quick action grid ─────────────────────────────────────────────
  quickRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  quickButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingVertical: spacing.md + 2,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
  },
  quickLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
  },

  // ── Sections ──────────────────────────────────────────────────────
  section: {
    marginBottom: spacing.md,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  sectionBody: {
    // Rows live directly on the sheet background — no card wrap needed,
    // dividers separate them visually.
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md - 2,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 22,
    textAlign: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: '500',
    marginTop: 2,
  },
});
