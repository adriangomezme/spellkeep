import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type Destination = {
  id: string;
  name: string;
  type: 'collection' | 'binder' | 'list';
};

const TYPE_ICONS: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  collection: 'library',
  binder: 'folder',
  list: 'list',
};

type Props = {
  visible: boolean;
  cardCount: number;
  onSelect: (collectionId: string) => void;
  onClose: () => void;
};

export function DestinationPicker({ visible, cardCount, onSelect, onClose }: Props) {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!visible) return;

    (async () => {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('collections')
        .select('id, name, type')
        .eq('user_id', user.id)
        .order('type')
        .order('name');

      setDestinations((data ?? []) as Destination[]);
      setIsLoading(false);
    })();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handleBar} />
          <Text style={styles.title}>
            Add {cardCount} card{cardCount !== 1 ? 's' : ''} to...
          </Text>

          {isLoading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={destinations}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.destinationRow}
                  onPress={() => onSelect(item.id)}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={TYPE_ICONS[item.type] ?? 'folder'}
                    size={22}
                    color={colors.primary}
                  />
                  <View style={styles.destinationInfo}>
                    <Text style={styles.destinationName}>{item.name}</Text>
                    <Text style={styles.destinationType}>{item.type}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
              style={styles.list}
            />
          )}

          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xxl + 20,
    maxHeight: '50%',
    ...shadows.lg,
  },
  handleBar: {
    width: 36,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  loader: {
    paddingVertical: spacing.xl,
  },
  list: {
    maxHeight: 250,
  },
  destinationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  destinationInfo: {
    flex: 1,
  },
  destinationName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  destinationType: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    textTransform: 'capitalize',
    marginTop: 1,
  },
  cancelButton: {
    alignItems: 'center',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  cancelText: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
});
