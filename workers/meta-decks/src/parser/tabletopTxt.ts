/**
 * Parses MTGGoldfish's "Exact Card Versions (Tabletop)" .txt format
 * into a flat row list. The format is two blocks separated by a
 * blank line: mainboard then sideboard. Each non-empty line is:
 *
 *   <qty> <name> [<SET>]
 *   <qty> <name> <hint> [<SET>]
 *
 * Where `<hint>` (optional) is one of:
 *   - a Scryfall UUID (36 chars, dashed)
 *   - a collector number (digits, sometimes with letter suffix)
 *   - a treatment label like `borderless`, `showcase`, `extended`
 *
 * Examples observed in real exports:
 *   1 Archdruid's Charm [MKM]
 *   13 Forest <254> [THB]
 *   4 Fabled Passage <019d4a1a-a82d-71f3-a23b-c05440b9bd9c> [SOC]
 *   2 Surrak, Elusive Hunter <borderless> [TDM]
 *
 * We classify the hint at parse time so the resolver can route each
 * line through the right lookup path.
 */
export type ParsedLine = {
  qty: number;
  name: string;
  /** Set code from the bracket, lowercased to match catalog `set_code`. */
  set: string;
  /** Mainboard or sideboard. */
  board: 'main' | 'side';
  /** Resolution hint extracted from `<...>` if present. */
  hint:
    | { kind: 'uuid'; value: string }
    | { kind: 'collectorNumber'; value: string }
    | { kind: 'treatment'; value: string }
    | null;
  /** 0-based position in the source block. Stable order for rendering. */
  position: number;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLLECTOR_NUMBER_RE = /^[0-9]+[a-z★†]?$/i;

const LINE_RE =
  /^\s*(\d+)\s+(.+?)(?:\s+<([^>]+)>)?\s+\[([A-Za-z0-9]+)\]\s*$/;

/**
 * MTGGoldfish uses set codes that don't always match Scryfall's. The
 * canonical example is The List: MTGGoldfish writes `[PLIST]` but
 * Scryfall (and our catalog) ingest it as `plst`. Add aliases here
 * as we discover them — typos vs. canonical Scryfall codes.
 */
const SET_ALIASES: Record<string, string> = {
  plist: 'plst',
};

export function parseTabletop(txt: string): ParsedLine[] {
  // Normalize newlines and split into raw lines. A blank line marks
  // the boundary between mainboard and sideboard. We do NOT trust
  // explicit "Sideboard" headers — MTGGoldfish's exact-version export
  // uses the blank-line convention.
  const lines = txt.replace(/\r\n?/g, '\n').split('\n');

  const out: ParsedLine[] = [];
  let board: 'main' | 'side' = 'main';
  let positionInBoard = 0;
  let sawAnyMain = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      // Flip to sideboard the first time we see a blank line *after*
      // we've already collected at least one mainboard row. Leading
      // blank lines (rare but possible) are ignored.
      if (sawAnyMain && board === 'main') {
        board = 'side';
        positionInBoard = 0;
      }
      continue;
    }
    // Optional "Sideboard" header line — some export variants include
    // it. Treat as a board flip and skip.
    if (/^sideboard\s*:?$/i.test(trimmed)) {
      board = 'side';
      positionInBoard = 0;
      continue;
    }

    const m = LINE_RE.exec(trimmed);
    if (!m) {
      // Unknown line shape — skip and let the caller log if it cares.
      continue;
    }
    const [, qtyRaw, nameRaw, hintRaw, setRaw] = m;
    const qty = Number(qtyRaw);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const rawSet = (setRaw ?? '').toLowerCase();
    out.push({
      qty,
      name: (nameRaw ?? '').trim(),
      set: SET_ALIASES[rawSet] ?? rawSet,
      board,
      hint: classifyHint(hintRaw),
      position: positionInBoard,
    });
    positionInBoard += 1;
    if (board === 'main') sawAnyMain = true;
  }

  return out;
}

function classifyHint(raw: string | undefined): ParsedLine['hint'] {
  if (!raw) return null;
  const v = raw.trim();
  if (v === '') return null;
  if (UUID_RE.test(v)) return { kind: 'uuid', value: v.toLowerCase() };
  if (COLLECTOR_NUMBER_RE.test(v)) return { kind: 'collectorNumber', value: v };
  return { kind: 'treatment', value: v.toLowerCase() };
}
