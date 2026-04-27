/**
 * Shared AI invocation helper for SpellKeep Edge Functions.
 *
 * All AI features (search-nl, future scan corrections, deck advice, …)
 * route through `callAiJSON`. Centralizing the call gives us:
 *   - one OpenRouter integration to maintain
 *   - one place to enforce model allowlists, timeouts, retries
 *   - one place to translate provider errors into user-friendly text
 *   - one place to emit telemetry (model, tokens, latency)
 *
 * Why OpenRouter and not direct provider SDKs: lets the app A/B-test
 * across Anthropic, Google and xAI by changing a single env var or
 * client setting — without re-deploying the function or shipping a
 * new mobile build.
 *
 * Required env:
 *   OPENROUTER_API_KEY        — server-side, never reaches the client
 *   OPENROUTER_DEFAULT_MODEL  — fallback when the request omits `model`
 * Optional env:
 *   OPENROUTER_ALLOWED_MODELS — CSV. If set, replaces the built-in
 *                               allowlist. Use to whitelist new models
 *                               at runtime without re-deploying.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Built-in allowlist. Mirrors the dev-settings preset list on the
// client; kept here as the authoritative source so the server stays
// useful even if the client drifts.
const BUILTIN_ALLOWED_MODELS = [
  "anthropic/claude-opus-4.7",
  "anthropic/claude-opus-4.6",
  "anthropic/claude-opus-4.5",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "google/gemini-3-pro-preview",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",
  "google/gemini-2.5-flash",
  "x-ai/grok-4.1-fast",
];

function getAllowedModels(): string[] {
  const env = Deno.env.get("OPENROUTER_ALLOWED_MODELS");
  if (env && env.trim().length > 0) {
    return env.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return BUILTIN_ALLOWED_MODELS;
}

export type AiCallOptions = {
  /** Override model. Must be in the allowlist. Falls back to env default. */
  model?: string;
  system: string;
  user: string;
  /** Hard cap on output tokens. Defaults to 2048. */
  maxTokens?: number;
  /** Hard timeout (ms) for the upstream call. Defaults to 45_000.
   *  Reasoning models (Gemini 3 Pro, Claude Opus, Grok 4.1) can spend
   *  10–30s on internal thinking tokens before emitting output, so the
   *  ceiling needs to accommodate the slowest legitimate response. */
  timeoutMs?: number;
  /** Retry once on rate-limit / overload responses. Timeouts are NOT
   *  retried — if a model is slow, retrying just doubles the wait. */
  retryOnTransient?: boolean;
  /** Free-form label for logs (e.g. "search-nl"). */
  feature?: string;
};

export type AiCallResult =
  | {
      ok: true;
      json: unknown;
      raw: string;
      modelUsed: string;
      latencyMs: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
      raw?: string;
      modelUsed?: string;
    };

/**
 * Calls OpenRouter with `response_format: json_object` and returns
 * parsed JSON. Failures collapse into a typed `{ ok: false }` shape
 * — callers translate to HTTP responses.
 */
export async function callAiJSON(opts: AiCallOptions): Promise<AiCallResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    return {
      ok: false,
      status: 500,
      error: "AI is misconfigured — OPENROUTER_API_KEY missing on server.",
    };
  }

  const requested = opts.model?.trim() ||
    Deno.env.get("OPENROUTER_DEFAULT_MODEL")?.trim() ||
    "anthropic/claude-haiku-4.5";

  const allowed = getAllowedModels();
  if (!allowed.includes(requested)) {
    return {
      ok: false,
      status: 400,
      error: `Model "${requested}" is not allowed. Allowed: ${allowed.join(", ")}`,
      modelUsed: requested,
    };
  }

  const maxTokens = opts.maxTokens ?? 2048;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const retry = opts.retryOnTransient ?? true;

  const attempts = retry ? 2 : 1;
  let lastErr: AiCallResult | null = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = await singleCall({
      apiKey,
      model: requested,
      system: opts.system,
      user: opts.user,
      maxTokens,
      timeoutMs,
      feature: opts.feature,
    });
    if (result.ok) return result;
    lastErr = result;
    // Only retry on rate-limit / overloaded — those are genuinely
    // transient and a second attempt usually succeeds. Timeouts (408,
    // 504) are NOT retried: if a model is slow, a retry just doubles
    // the user's wait without changing the outcome.
    if (![429, 529].includes(result.status)) break;
    await new Promise((r) => setTimeout(r, 600));
  }
  return lastErr!;
}

async function singleCall(args: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  feature?: string;
}): Promise<AiCallResult> {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), args.timeoutMs);

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Authorization": `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
        // OpenRouter recommends these for usage attribution + dashboard
        // analytics — neither is sensitive.
        "HTTP-Referer": "https://spellkeep.app",
        "X-Title": "SpellKeep",
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        // JSON-mode: every preset model on the allowlist supports this.
        // Falls back to a JSON-shaped string if the provider can't.
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: args.system },
          { role: "user", content: args.user },
        ],
      }),
    });

    const latencyMs = Date.now() - start;
    const bodyText = await res.text();

    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: translateError(res.status, bodyText),
        raw: bodyText.slice(0, 400),
        modelUsed: args.model,
      };
    }

    let outer: any;
    try {
      outer = JSON.parse(bodyText);
    } catch {
      return {
        ok: false,
        status: 502,
        error: "AI returned non-JSON envelope.",
        raw: bodyText.slice(0, 400),
        modelUsed: args.model,
      };
    }

    const content = outer?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return {
        ok: false,
        status: 502,
        error: "AI returned an empty response.",
        raw: bodyText.slice(0, 400),
        modelUsed: args.model,
      };
    }

    // Strip code fences defensively. Some providers wrap JSON in
    // ```json … ``` even with json-mode enabled.
    const cleaned = content
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        status: 502,
        error: "AI returned malformed JSON.",
        raw: cleaned.slice(0, 400),
        modelUsed: args.model,
      };
    }

    // Telemetry — Supabase log drains pick this up. Searchable by
    // `event="ai_call"` to compare model latency/cost during testing.
    const usage = outer?.usage ?? {};
    console.log(JSON.stringify({
      event: "ai_call",
      feature: args.feature ?? "unknown",
      model: args.model,
      prompt_tokens: usage.prompt_tokens,
      completion_tokens: usage.completion_tokens,
      latency_ms: latencyMs,
    }));

    return {
      ok: true,
      json: parsed,
      raw: cleaned,
      modelUsed: args.model,
      latencyMs,
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return {
      ok: false,
      status: aborted ? 504 : 500,
      error: aborted
        ? "AI request timed out."
        : err instanceof Error
        ? err.message
        : "Unknown network error",
      modelUsed: args.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Translates OpenRouter / provider error responses into messages safe
 * to surface to the end user. We never leak raw provider JSON.
 */
function translateError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401 || lower.includes("invalid api key") || lower.includes("authentication")) {
    return "AI is misconfigured — the OpenRouter API key on the server is invalid. Contact the app maintainer.";
  }
  if (status === 402 || lower.includes("insufficient") || lower.includes("credits")) {
    return "AI provider is out of credits. Contact the app maintainer.";
  }
  if (status === 429 || lower.includes("rate")) {
    return "AI is rate-limited right now. Try again in a moment.";
  }
  if (status === 529 || lower.includes("overloaded")) {
    return "AI provider is overloaded. Please retry shortly.";
  }
  if (status === 404 || lower.includes("not found") || lower.includes("does not exist")) {
    return "Selected model is not available right now — try another from settings.";
  }
  if (status === 408 || status === 504 || lower.includes("timeout")) {
    return "AI request timed out. Please try again.";
  }
  return "AI request failed. Please try again.";
}
