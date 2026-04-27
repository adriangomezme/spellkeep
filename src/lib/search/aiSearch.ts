import type { SearchFilterState } from './searchFilters';
import { getCurrentAiModel } from '../hooks/useAiModel';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export type AiSearchResult =
  | {
      kind: 'filters';
      query: string;
      filters: Partial<SearchFilterState>;
      reasoning: string;
    }
  | {
      kind: 'clarify';
      question: string;
    }
  | {
      kind: 'error';
      error: string;
    };

/**
 * Calls the `search-nl` Edge Function to translate a natural-language
 * MTG search prompt into a SearchFilterState. Same fetch pattern as
 * `ensureCardExists` (anon key + bearer token) since PowerSync's
 * ES256 JWTs aren't accepted by the functions runtime.
 *
 * Returns a typed discriminated union — callers branch on `.kind`.
 * Network / model failures collapse into `{ kind: 'error' }` so the
 * UI never has to deal with a thrown promise.
 */
export async function aiSearchFromPrompt(
  prompt: string,
  options?: { model?: string }
): Promise<AiSearchResult> {
  // Dev-only: per-device model override picked from Settings → AI
  // Model. Empty string means "use the server default". Caller can
  // also pass `options.model` explicitly for tests / future features.
  const model = options?.model?.trim() || getCurrentAiModel();
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/search-nl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(model ? { prompt, model } : { prompt }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        kind: 'error',
        error: body?.error ?? `Request failed (${res.status})`,
      };
    }
    if (body?.kind === 'filters' || body?.kind === 'clarify' || body?.kind === 'error') {
      return body as AiSearchResult;
    }
    return { kind: 'error', error: 'Unexpected response shape' };
  } catch (err: any) {
    return { kind: 'error', error: err?.message ?? 'Network error' };
  }
}
