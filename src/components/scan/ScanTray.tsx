import { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ScrollView, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScanTrayItem as TrayItemType } from './useScanState';
import { ScanTrayItemRow } from './ScanTrayItem';
import { TrayCardDetail } from './TrayCardDetail';
import { TrayItemEditor } from './TrayItemEditor';
import { DestinationPicker } from './DestinationPicker';
import { ScryfallCard } from '../../lib/scryfall';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Props = {
  items: TrayItemType[];
  visible: boolean;
  onClose: () => void;
  isSaving: boolean;
  onSaveItem: (id: string, updates: Partial<TrayItemType>) => void;
  onDeleteItem: (id: string) => void;
  onClear: () => void;
  showDestinationPicker: boolean;
  onOpenDestinationPicker: () => void;
  onCloseDestinationPicker: () => void;
  onAddAllToDestination: (collectionId: string) => Promise<void>;
};

export function ScanTray({
  items,
  visible,
  onClose,
  isSaving,
  onSaveItem,
  onDeleteItem,
  onClear,
  showDestinationPicker,
  onOpenDestinationPicker,
  onCloseDestinationPicker,
  onAddAllToDestination,
}: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [detailCard, setDetailCard] = useState<ScryfallCard | null>(null);
  const [editingItem, setEditingItem] = useState<TrayItemType | null>(null);

  const filtered = search
    ? items.filter((item) => item.card.name.toLowerCase().includes(search.toLowerCase()))
    : items;

  return (
    <Modal visible={visible} transparent={!detailCard} animationType="slide" onRequestClose={detailCard ? () => setDetailCard(null) : onClose}>
      {detailCard ? (
        <TrayCardDetail card={detailCard} onBack={() => setDetailCard(null)} />
      ) : (
      <GestureHandlerRootView style={{ flex: 1 }}>
      <>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerInfo}>
            <Text style={styles.title}>
              {items.reduce((sum, i) => sum + i.quantity, 0)} card{items.reduce((sum, i) => sum + i.quantity, 0) !== 1 ? 's' : ''} scanned
            </Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Ionicons name="close" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        {items.length > 0 && (
          <View style={styles.searchRow}>
            <Ionicons name="search" size={16} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search cards..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="layers-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Tray is empty</Text>
            <Text style={styles.emptySubtitle}>Scanned cards will appear here</Text>
          </View>
        ) : (
          <>
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {filtered.map((item) => (
                <ScanTrayItemRow
                  key={item.id}
                  item={item}
                  onEdit={(id) => {
                    const found = items.find((i) => i.id === id);
                    if (found) setEditingItem(found);
                  }}
                  onDelete={onDeleteItem}
                  onCardPress={(item) => setDetailCard(item.card)}
                />
              ))}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.sm }]}>
              <TouchableOpacity style={styles.clearButton} onPress={onClear}>
                <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                <Text style={styles.clearText}>Clear</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addButton}
                onPress={onOpenDestinationPicker}
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
      </>
      </GestureHandlerRootView>
      )}

      <TrayItemEditor
        visible={editingItem !== null}
        item={editingItem}
        onSave={onSaveItem}
        onDelete={onDeleteItem}
        onClose={() => setEditingItem(null)}
      />

      <DestinationPicker
        visible={showDestinationPicker}
        cardCount={items.reduce((sum, i) => sum + i.quantity, 0)}
        onSelect={onAddAllToDestination}
        onClose={onCloseDestinationPicker}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  container: {
    height: '80%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xxl,
    fontWeight: '800',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 40,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 0.5,
    borderTopColor: colors.divider,
    backgroundColor: colors.background,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
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
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  addText: {
    color: '#FFFFFF',
    fontSize: fontSize.md,
    fontWeight: '700',
  },
});
