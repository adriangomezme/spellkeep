import { searchCards, ScryfallCard } from './scryfall';

/**
 * Extracts a likely card name from OCR text.
 * MTG cards have the name at the top in large font.
 * The OCR result comes as blocks/lines — the first meaningful line
 * is usually the card name.
 */
export function extractCardName(ocrText: string): string | null {
  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 50);

  if (lines.length === 0) return null;

  // The card name is typically the first line with mostly letters
  for (const line of lines) {
    // Skip lines that are mostly numbers or symbols
    const letterRatio = (line.match(/[a-zA-Z]/g)?.length ?? 0) / line.length;
    if (letterRatio > 0.6) {
      // Clean up common OCR artifacts
      return line
        .replace(/[|{}[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  return lines[0];
}

/**
 * Extracts collector number from OCR text.
 * Usually at the bottom of the card in format "123/456" or just "123".
 */
export function extractCollectorNumber(ocrText: string): string | null {
  const match = ocrText.match(/(\d{1,4})\s*[/]\s*(\d{1,4})/);
  if (match) return match[1];

  // Try standalone number near the bottom
  const lines = ocrText.split('\n').reverse();
  for (const line of lines) {
    const numMatch = line.trim().match(/^(\d{1,4})$/);
    if (numMatch) return numMatch[1];
  }

  return null;
}

/**
 * Search for a card by extracted OCR text.
 * Returns the best match candidates.
 */
export async function matchCard(ocrText: string): Promise<ScryfallCard[]> {
  const cardName = extractCardName(ocrText);
  if (!cardName) return [];

  const collectorNumber = extractCollectorNumber(ocrText);

  // Build Scryfall query
  let query = `!"${cardName}"`;
  if (collectorNumber) {
    query += ` cn:${collectorNumber}`;
  }

  try {
    const result = await searchCards(query, 1);
    if (result && result.data.length > 0) {
      return result.data.slice(0, 5);
    }

    // Fallback: fuzzy search without exact match
    const fuzzyResult = await searchCards(cardName, 1);
    return fuzzyResult?.data.slice(0, 5) ?? [];
  } catch {
    return [];
  }
}
