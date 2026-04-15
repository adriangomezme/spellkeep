import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { ScreenPlaceholder } from '../../src/components/ScreenPlaceholder';

export default function ScanScreen() {
  if (Platform.OS === 'web') {
    return (
      <ScreenPlaceholder
        title="Scan"
        icon="scan"
        subtitle="Camera scanning is only available on mobile devices"
      />
    );
  }

  return <ScanScreenNative />;
}

function ScanScreenNative() {
  const [isFocused, setIsFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const { ScanCamera } = require('../../src/components/ScanCamera');
  return <ScanCamera isActive={isFocused} />;
}
