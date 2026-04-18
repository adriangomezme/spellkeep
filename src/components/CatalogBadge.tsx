import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, fontSize, borderRadius } from '../constants';
import {
  ensureCatalogFresh,
  getCatalogSyncState,
  subscribeCatalogSync,
} from '../lib/catalog/catalogSync';
import type { CatalogSyncState } from '../lib/catalog/types';

/**
 * Discreet inline indicator for the local catalog sync status.
 *
 * - Shows nothing when the catalog is idle-ready (the usual case).
 * - Shows a small progress pill while downloading / applying the catalog.
 * - Shows an error pill with a retry tap when sync failed.
 *
 * Drop this anywhere that has a bit of space — header right side is typical.
 */
export function CatalogBadge() {
  const [state, setState] = useState<CatalogSyncState>(() => getCatalogSyncState());

  useEffect(() => subscribeCatalogSync(setState), []);

  if (state.status === 'idle' || state.status === 'ready') return null;

  if (state.status === 'error') {
    return (
      <TouchableOpacity
        style={[styles.pill, styles.error]}
        onPress={() => {
          Alert.alert('Catálogo', state.error ?? 'Error de sincronización', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Reintentar', onPress: () => { ensureCatalogFresh().catch(() => {}); } },
          ]);
        }}
      >
        <Ionicons name="warning-outline" size={14} color={colors.error} />
        <Text style={[styles.text, { color: colors.error }]}>Catálogo</Text>
      </TouchableOpacity>
    );
  }

  const label =
    state.status === 'checking' ? 'Comprobando…'
    : state.status === 'downloading' ? 'Descargando…'
    : 'Aplicando…';

  const pct = state.progress == null ? null : Math.round(state.progress * 100);

  return (
    <View style={styles.pill}>
      <ActivityIndicator size="small" color={colors.primary} />
      <Text style={styles.text}>
        {label}{pct != null ? ` ${pct}%` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  error: {
    backgroundColor: colors.error + '15',
  },
  text: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
});
