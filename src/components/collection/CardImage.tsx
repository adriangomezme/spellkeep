import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────
// Card artwork with a local placeholder.
//
// The collection screens render ~hundreds of cards that enrich in waves
// (catalog.db → Supabase fallback). Rows that haven't resolved yet would
// otherwise paint as a flat gray rectangle — ugly at 21k cards. We show
// the bundled placeholder in three cases:
//   1. The URI is empty (row not yet enriched).
//   2. The remote image is still downloading (`placeholder` prop).
//   3. The remote image failed (onError).
//
// One `require()` at module scope; expo-image caches the resolved asset.
// ─────────────────────────────────────────────────────────────────────────

const PLACEHOLDER = require('../../../assets/card-placeholder.jpg');

type Props = {
  uri: string | null | undefined;
  style: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  transition?: number;
};

export function CardImage({ uri, style, contentFit = 'cover', transition = 150 }: Props) {
  if (!uri) {
    return (
      <Image
        source={PLACEHOLDER}
        style={style}
        contentFit={contentFit}
        transition={0}
      />
    );
  }
  return (
    <Image
      source={{ uri }}
      placeholder={PLACEHOLDER}
      style={style}
      contentFit={contentFit}
      transition={transition}
    />
  );
}
