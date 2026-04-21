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

  // Force a full snapshot regeneration even if the weekly schedule
  // hasn't elapsed. Useful for the initial bootstrap run.
  forceSnapshot: process.env.FORCE_SNAPSHOT === 'true',

  // Skip snapshot generation entirely (e.g. for fast iteration / debug runs).
  skipSnapshot: process.env.SKIP_SNAPSHOT === 'true',

  // Light-mode: skip sets + cards bulk + snapshot. Only refresh prices
  // for cards that have active alerts and evaluate those alerts. Used by
  // the 18:00 / 23:00 UTC sweeps between the full daily run.
  alertsOnly: process.env.ALERTS_ONLY === 'true',
};
