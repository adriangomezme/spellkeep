import { searchCards, ScryfallCard } from './scryfall';

/**
 * MTG card type keywords used to identify if OCR text is from a Magic card.
 */
const MTG_TYPE_KEYWORDS = [
  'creature', 'instant', 'sorcery', 'enchantment', 'artifact',
  'planeswalker', 'land', 'legendary', 'tribal', 'battle',
  'token', 'basic', 'snow', 'world',
];

/**
 * Common 3-4 letter English words to exclude from set code detection.
 */
const COMMON_WORDS = new Set([
  'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL',
  'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'HAS', 'HIS',
  'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'WAY',
  'WHO', 'DID', 'GET', 'HAS', 'HIM', 'LET', 'SAY', 'SHE',
  'TOO', 'USE', 'DAD', 'MOM', 'SET', 'RUN', 'GOT', 'EACH',
  'MAKE', 'LIKE', 'LONG', 'LOOK', 'MANY', 'SOME', 'THEM',
  'THAN', 'BEEN', 'HAVE', 'FROM', 'THAT', 'THIS', 'WILL',
  'WITH', 'WHAT', 'WHEN', 'YOUR', 'WERE', 'THEY', 'BEEN',
  'INTO', 'ONLY', 'COME', 'MADE', 'FIND', 'MORE', 'ALSO',
]);

type MTGRegions = {
  name: string | null;
  typeLine: string | null;
  setCode: string | null;
  collectorNumber: string | null;
};

type ValidationResult = {
  isCard: boolean;
  confidence: number;
  regions: MTGRegions;
};

/**
 * Validates whether OCR text has the structural layout of an MTG card.
 * Returns isCard: true only when at least 2 MTG-specific regions are detected.
 */
export function validateMTGLayout(ocrText: string): ValidationResult {
  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { isCard: false, confidence: 0, regions: { name: null, typeLine: null, setCode: null, collectorNumber: null } };
  }

  const regions: MTGRegions = {
    name: null,
    typeLine: null,
    setCode: null,
    collectorNumber: null,
  };

  let confidence = 0;

  // Look for card name (first lines, mostly alphabetic, reasonable length)
  for (const line of lines.slice(0, 3)) {
    const letterRatio = (line.match(/[a-zA-Z]/g)?.length ?? 0) / line.length;
    if (letterRatio > 0.6 && line.length >= 3 && line.length <= 45) {
      regions.name = line.replace(/[|{}[\]]/g, '').replace(/\s+/g, ' ').trim();
      confidence += 1;
      break;
    }
  }

  // Look for type line (contains MTG type keywords)
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const hasTypeKeyword = MTG_TYPE_KEYWORDS.some((kw) => lowerLine.includes(kw));
    if (hasTypeKeyword) {
      regions.typeLine = line;
      confidence += 2; // Type line is a strong signal
      break;
    }
  }

  // Look for collector number (bottom of card, format: "123" or "123/456")
  for (const line of lines.slice().reverse()) {
    const cnMatch = line.match(/(\d{1,4})\s*[/]\s*(\d{1,4})/);
    if (cnMatch) {
      regions.collectorNumber = cnMatch[1];
      confidence += 1;
      break;
    }
    const standaloneMatch = line.match(/\b(\d{1,4})\b/);
    if (standaloneMatch && line.length < 20) {
      regions.collectorNumber = standaloneMatch[1];
      confidence += 0.5;
      break;
    }
  }

  // Look for set code (3-4 uppercase letters near collector number)
  for (const line of lines.slice().reverse()) {
    const setMatch = line.match(/\b([A-Z]{3,4})\b/);
    if (setMatch && !COMMON_WORDS.has(setMatch[1])) {
      regions.setCode = setMatch[1].toLowerCase();
      confidence += 1;
      break;
    }
  }

  // Need at least 2 confidence points (type line alone = 2, name + collector = 2)
  return {
    isCard: confidence >= 2,
    confidence,
    regions,
  };
}

/**
 * Extracts the set code from OCR text.
 * Set codes are 3-4 uppercase letters typically near the collector number.
 */
export function extractSetCode(ocrText: string): string | null {
  const lines = ocrText.split('\n').reverse();

  for (const line of lines) {
    // Look for set code adjacent to collector number: "CMM 295" or "CMM · 295/674"
    const combined = line.match(/\b([A-Z]{3,4})\s*[·\-\s]*\d{1,4}/);
    if (combined && !COMMON_WORDS.has(combined[1])) {
      return combined[1].toLowerCase();
    }
  }

  // Fallback: any 3-4 letter uppercase word in bottom lines
  for (const line of lines.slice(0, 5)) {
    const match = line.match(/\b([A-Z]{3,4})\b/);
    if (match && !COMMON_WORDS.has(match[1])) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

/**
 * Extracts collector number from OCR text.
 * Usually at the bottom in format "123/456", "123", or "★123".
 */
export function extractCollectorNumber(ocrText: string): string | null {
  const lines = ocrText.split('\n').reverse();

  for (const line of lines.slice(0, 5)) {
    // Format: "295/674" or "295 / 674"
    const slashMatch = line.match(/(\d{1,4})\s*[/]\s*\d{1,4}/);
    if (slashMatch) return slashMatch[1];

    // Format: standalone number on a short line (collector number area)
    if (line.trim().length < 15) {
      const numMatch = line.match(/[★*]?(\d{1,4})/);
      if (numMatch) return numMatch[1];
    }
  }

  return null;
}

/**
 * Extracts a likely card name from the top of OCR text.
 */
export function extractCardName(ocrText: string): string | null {
  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length >= 3 && l.length <= 50);

  for (const line of lines.slice(0, 3)) {
    const letterRatio = (line.match(/[a-zA-Z]/g)?.length ?? 0) / line.length;
    if (letterRatio > 0.6) {
      return line.replace(/[|{}[\]]/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  return lines[0] ?? null;
}

/**
 * Search for a card by OCR text. Validates the text looks like an MTG card
 * before making any API calls. Builds exact print queries when possible.
 */
export async function matchCard(ocrText: string): Promise<ScryfallCard[]> {
  const validation = validateMTGLayout(ocrText);

  if (!validation.isCard) {
    return [];
  }

  const { name, setCode, collectorNumber } = validation.regions;
  if (!name) return [];

  // Build the most specific query possible
  let query = `!"${name}"`;
  if (setCode) query += ` set:${setCode}`;
  if (collectorNumber) query += ` cn:${collectorNumber}`;

  try {
    const result = await searchCards(query, { page: 1 });
    if (result && result.data.length > 0) {
      return result.data.slice(0, 5);
    }

    // Fallback: try with just the name (exact match)
    if (setCode || collectorNumber) {
      const nameOnly = await searchCards(`!"${name}"`, { page: 1 });
      if (nameOnly && nameOnly.data.length > 0) {
        return nameOnly.data.slice(0, 5);
      }
    }

    // Last resort: fuzzy search
    const fuzzy = await searchCards(name, { page: 1 });
    return fuzzy?.data.slice(0, 5) ?? [];
  } catch {
    return [];
  }
}
