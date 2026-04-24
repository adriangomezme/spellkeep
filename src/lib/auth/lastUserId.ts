import AsyncStorage from '@react-native-async-storage/async-storage';

// Persists the last auth user id we saw so we can detect transitions
// (logout+login, anon→real account, account A → account B) across
// app restarts. When this differs from the current auth user id we
// treat it as a session switch and wipe the local SQLite user data
// before reconnecting PowerSync.

const KEY = '@spellkeep/last_user_id.v1';

export async function getLastUserId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function setLastUserId(id: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch (err) {
    console.warn('[lastUserId] setItem failed', err);
  }
}

export async function clearLastUserId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (err) {
    console.warn('[lastUserId] removeItem failed', err);
  }
}
