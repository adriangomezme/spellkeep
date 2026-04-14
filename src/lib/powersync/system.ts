import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './schema';
import { SupabaseConnector } from './SupabaseConnector';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'spellkeep.db',
  },
});

export const connector = new SupabaseConnector();

export async function setupPowerSync() {
  await db.init();
  await db.connect(connector);
}
