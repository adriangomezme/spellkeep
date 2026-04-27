// Curated list of OpenRouter model slugs we want to evaluate during
// the model-selection phase. The server enforces the same allowlist
// in `supabase/functions/_shared/ai.ts` — keep these in sync.
//
// Verified against openrouter.ai on 2026-04-27.

export type AiModelPreset = {
  slug: string;
  label: string;
  vendor: 'Anthropic' | 'Google' | 'xAI';
  /** Short hint surfaced under the chip (≤30 chars). */
  hint: string;
};

export const AI_MODEL_PRESETS: AiModelPreset[] = [
  {
    slug: 'anthropic/claude-opus-4.7',
    label: 'Claude Opus 4.7',
    vendor: 'Anthropic',
    hint: 'Newest frontier · top quality',
  },
  {
    slug: 'anthropic/claude-opus-4.6',
    label: 'Claude Opus 4.6',
    vendor: 'Anthropic',
    hint: 'Frontier · 1M context',
  },
  {
    slug: 'anthropic/claude-opus-4.5',
    label: 'Claude Opus 4.5',
    vendor: 'Anthropic',
    hint: 'Frontier · highest quality',
  },
  {
    slug: 'anthropic/claude-sonnet-4.5',
    label: 'Claude Sonnet 4.5',
    vendor: 'Anthropic',
    hint: 'Frontier · balanced',
  },
  {
    slug: 'anthropic/claude-haiku-4.5',
    label: 'Claude Haiku 4.5',
    vendor: 'Anthropic',
    hint: 'Fast · cheap',
  },
  {
    slug: 'google/gemini-3-pro-preview',
    label: 'Gemini 3 Pro',
    vendor: 'Google',
    hint: 'Frontier · preview',
  },
  {
    slug: 'google/gemini-3-flash-preview',
    label: 'Gemini 3 Flash',
    vendor: 'Google',
    hint: 'Fast · 1M context',
  },
  {
    slug: 'google/gemini-3.1-flash-lite-preview',
    label: 'Gemini 3.1 Flash Lite',
    vendor: 'Google',
    hint: 'Cheapest · high volume',
  },
  {
    slug: 'google/gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    vendor: 'Google',
    hint: 'Stable · fast',
  },
  {
    slug: 'x-ai/grok-4.1-fast',
    label: 'Grok 4.1 Fast',
    vendor: 'xAI',
    hint: 'Agentic · 2M context',
  },
];
