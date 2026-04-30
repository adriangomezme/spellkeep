function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export type Format = 'standard' | 'modern' | 'pioneer';

const ALL_FORMATS: Format[] = ['standard', 'modern', 'pioneer'];

function parseFormats(raw: string | undefined): Format[] {
  if (!raw || raw.trim() === '') return ALL_FORMATS;
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  const valid: Format[] = [];
  for (const p of parts) {
    if (ALL_FORMATS.includes(p as Format)) valid.push(p as Format);
  }
  return valid.length > 0 ? valid : ALL_FORMATS;
}

export const config = {
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  // Which formats to sync this run. Defaults to all three.
  formats: parseFormats(process.env.META_FORMATS),
  // How many archetypes to keep per format. The segmented control in
  // the Search hub's Meta sections is horizontally scrollable, so we
  // can comfortably surface up to 6 archetypes per format. Worker
  // accepts an override at runtime.
  topN: Number(process.env.META_TOP_N ?? 6),
  // MTGGoldfish has no public API; we scrape their HTML pages. Be a
  // polite citizen — identify ourselves and pause between fetches so
  // we don't hammer them. The 5-day cron cadence keeps total volume
  // tiny anyway.
  userAgent:
    process.env.META_UA ?? 'SpellKeep/meta-decks (admin@spellkeep.app)',
  betweenFetchSleepMs: Number(process.env.META_SLEEP_MS ?? 1500),
  // Base URL — overridable mainly for tests / local mocks.
  goldfishBase: process.env.META_BASE ?? 'https://mtggoldfish.com',
};
