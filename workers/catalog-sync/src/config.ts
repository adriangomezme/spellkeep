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

  // Skip delta generation (e.g. first-ever run where there is no prior baseline).
  skipDelta: process.env.SKIP_DELTA === 'true',
};
