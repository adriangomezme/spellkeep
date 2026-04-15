import { Platform } from 'react-native';
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

  const { ScanCamera } = require('../../src/components/ScanCamera');
  return <ScanCamera />;
}
