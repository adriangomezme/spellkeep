import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadows, spacing, fontSize, borderRadius } from '../../constants';

type SetInfo = {
  code: string;
  name: string;
  icon_svg_uri: string;
  card_count: number;
};

type Props = {
  selectedSet: string | null;
  onSelect: (code: string | null) => void;
  onBack: () => void;
};

export function SetFilterScreen({ selectedSet, onSelect, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const [sets, setSets] = useState<SetInfo[]>([]);
  const [filtered, setFiltered] = useState<SetInfo[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('https://api.scryfall.com/sets')
      .then((r) => r.json())
      .then((data) => {
        const list = (data.data ?? [])
          .filter((s: any) => s.card_count > 0 && s.set_type !== 'token')
          .map((s: any) => ({
            code: s.code,
            name: s.name,
            icon_svg_uri: s.icon_svg_uri,
            card_count: s.card_count,
          }));
        setSets(list);
        setFiltered(list);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!search) {
      setFiltered(sets);
      return;
    }
    const lower = search.toLowerCase();
    setFiltered(
      sets.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) ||
          s.code.toLowerCase().includes(lower)
      )
    );
  }, [search, sets]);

  function handleSelect(code: string) {
    onSelect(selectedSet === code ? null : code);
    onBack();
  }

  function handleClear() {
    onSelect(null);
    onBack();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Filter by Set</Text>
        {selectedSet && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or code..."
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoFocus
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Set list */}
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSelected = item.code === selectedSet;
            return (
              <TouchableOpacity
                style={[styles.setRow, isSelected && styles.setRowSelected]}
                onPress={() => handleSelect(item.code)}
                activeOpacity={0.6}
              >
                <Image
                  source={{ uri: item.icon_svg_uri }}
                  style={styles.setIcon}
                  contentFit="contain"
                  tintColor={isSelected ? colors.primary : colors.textSecondary}
                />
                <View style={styles.setInfo}>
                  <Text style={[styles.setName, isSelected && styles.setNameSelected]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.setCode}>{item.code.toUpperCase()} · {item.card_count} cards</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No sets found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: '800',
  },
  clearButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearText: {
    color: colors.error,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 44,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: spacing.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  setRowSelected: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    borderBottomWidth: 0,
    marginBottom: 1,
  },
  setIcon: {
    width: 28,
    height: 28,
  },
  setInfo: {
    flex: 1,
  },
  setName: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
  setNameSelected: {
    color: colors.primary,
  },
  setCode: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: 1,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
  },
});
