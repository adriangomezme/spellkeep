import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScanTrayItem as TrayItemType } from './useScanState';
import { ScanTrayItemRow } from './ScanTrayItem';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  items: TrayItemType[];
  expanded: boolean;
  onToggleExpand: () => void;
  isSaving: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onAddTo: () => void;
  bottomInset: number;
};

export function ScanTray({
  items,
  expanded,
  onToggleExpand,
  isSaving,
  onEdit,
  onDelete,
  onClear,
  onAddTo,
  bottomInset,
}: Props) {
  if (items.length === 0) return null;

  // Calculate the max list height: screen - header - footer - tab bar - insets
  const listMaxHeight = expanded ? SCREEN_HEIGHT * 0.85 - 180 - bottomInset : 0;

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: bottomInset + 90 },
      ]}
    >
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={onToggleExpand}
        activeOpacity={0.7}
      >
        <View style={styles.handleBar} />
        <View style={styles.headerRow}>
          <Ionicons
            name={expanded ? 'chevron-down' : 'chevron-up'}
            size={18}
            color={colors.textMuted}
          />
          <Text style={styles.headerText}>
            {items.length} card{items.length !== 1 ? 's' : ''} scanned
          </Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{items.length}</Text>
          </View>
        </View>
      </TouchableOpacity>

      {/* Expanded content */}
      {expanded && (
        <>
          <ScrollView
            style={{ maxHeight: listMaxHeight }}
            showsVerticalScrollIndicator={false}
          >
            {items.map((item) => (
              <ScanTrayItemRow
                key={item.id}
                item={item}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.clearButton} onPress={onClear}>
              <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.addButton}
              onPress={onAddTo}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="add" size={18} color="#FFFFFF" />
                  <Text style={styles.addText}>Add to...</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    ...shadows.lg,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
    flex: 1,
  },
  headerBadge: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderTopWidth: 0.5,
    borderTopColor: colors.divider,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
  },
  clearText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.xs,
  },
  addText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
