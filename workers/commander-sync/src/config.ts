function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  // How many commanders to persist per window. The mobile app shows
  // 30; we store more so future iterations (filters, deeper feeds)
  // don't need a worker re-run.
  topN: Number(process.env.COMMANDER_TOP_N ?? 100),
  // EDHREC is rate-limited but the .json endpoint is unofficially
  // public. Be a polite citizen: identify ourselves and sleep
  // briefly between window fetches.
  userAgent:
    process.env.COMMANDER_UA ?? 'SpellKeep/commander-sync (admin@spellkeep.app)',
  betweenFetchSleepMs: Number(process.env.COMMANDER_SLEEP_MS ?? 1500),
};
