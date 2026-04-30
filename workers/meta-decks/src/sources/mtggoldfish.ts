import * as cheerio from 'cheerio';
import { config, type Format } from '../config.ts';

/**
 * MTGGoldfish has no public API for the metagame data, so we scrape
 * the HTML index for each format and pull the top archetype tiles in
 * order. Each tile carries the canonical archetype URL (with slug),
 * a display name, a meta-percent value, and a colors hint we ignore
 * because the worker re-derives `colors` from the actual mainboard
 * cards (more authoritative than what MTGGoldfish pre-renders).
 */
export type MetagameArchetype = {
  /** The slug taken from the canonical archetype URL — e.g.
   *  "mono-green-landfall-woe". Stable across worker runs. */
  slug: string;
  /** Display name as shown in the tile, e.g. "Mono-Green Landfall". */
  name: string;
  /** Absolute URL to the archetype detail page (sans `#paper`/`#online`). */
  url: string;
  /** Numeric meta share if MTGGoldfish exposes it on the index, else null. */
  metaShare: number | null;
};

export async function fetchMetagame(
  format: Format,
  topN: number
): Promise<MetagameArchetype[]> {
  const url = `${config.goldfishBase}/metagame/${format}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const out: MetagameArchetype[] = [];
  const seenSlugs = new Set<string>();

  $('.archetype-tile').each((_i, el) => {
    if (out.length >= topN) return false;
    const tile = $(el);

    // Canonical link is `card-image-tile-link-overlay` — the only
    // anchor on the tile that points to the bare `/archetype/<slug>`
    // URL without a fragment. The title links carry `#paper` /
    // `#online` suffixes we don't want.
    const overlayHref = tile
      .find('a.card-image-tile-link-overlay')
      .first()
      .attr('href');
    if (!overlayHref) return;
    const slug = overlayHref.replace(/^\/archetype\//, '').replace(/\/$/, '');
    if (!slug || seenSlugs.has(slug)) return;

    // Display name — pick the paper-tagged title link if present,
    // fall back to the online one. They render the same text.
    let name =
      tile.find('.archetype-tile-title .deck-price-paper a').first().text().trim() ||
      tile.find('.archetype-tile-title .deck-price-online a').first().text().trim();
    if (!name) {
      name = tile.find('.archetype-tile-title a').first().text().trim();
    }
    if (!name) return;

    const metaShareText = tile
      .find('.metagame-percentage .archetype-tile-statistic-value')
      .first()
      .text()
      .replace(/\(.*?\)/g, '')
      .trim();
    const metaShare = parseMetaShare(metaShareText);

    out.push({
      slug,
      name,
      url: `${config.goldfishBase}/archetype/${slug}`,
      metaShare,
    });
    seenSlugs.add(slug);
    return undefined;
  });

  if (out.length === 0) {
    throw new Error(`metagame ${format}: no archetype tiles parsed`);
  }
  return out;
}

/**
 * The archetype detail page exposes a "Download" dropdown with several
 * formats; the one we want is "Exact Card Versions (Tabletop)" which
 * carries the canonical print info we need (set + collector number,
 * occasionally a Scryfall UUID).
 *
 * The href looks like `/deck/download/<id>?output=mtggoldfish&type=tabletop`
 * — we extract it from the page so we don't have to know the deck id
 * up front.
 */
export async function fetchDeckTabletopTxt(
  archetypeUrl: string
): Promise<string> {
  const html = await fetchHtml(archetypeUrl);
  const $ = cheerio.load(html);

  const link = $('a.dropdown-item')
    .filter((_i, el) => $(el).text().trim() === 'Exact Card Versions (Tabletop)')
    .first()
    .attr('href');
  if (!link) {
    throw new Error(
      `archetype ${archetypeUrl}: Tabletop download link not found`
    );
  }

  const absolute = link.startsWith('http')
    ? link
    : `${config.goldfishBase}${link}`;

  const res = await fetch(absolute, {
    headers: {
      'user-agent': config.userAgent,
      accept: 'text/plain',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(
      `tabletop txt ${absolute}: ${res.status} ${res.statusText}`
    );
  }
  return res.text();
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': config.userAgent,
      accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`html ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

function parseMetaShare(text: string): number | null {
  // Expected format: "14.5%" or "14.5 %" — strip the % and parse.
  const cleaned = text.replace(/%/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
