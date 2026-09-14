/**
 * Shared Gemini generateContent helper with model fallback on rate limits.
 */

/** Preferred order when a model is rate-limited (matches common AI Studio Flash quotas). */
const BUILTIN_FALLBACKS = [
  'gemini-3-flash',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

/**
 * Read at call time (after loadEnv), not at module import.
 * @param {string} [override]
 * @returns {string}
 */
function primaryModel(override) {
  const custom = typeof override === 'string' ? override.trim() : '';
  if (custom) return custom;
  return process.env.GEMINI_MODEL || 'gemini-3.6-flash';
}

/**
 * @param {string} [primaryOverride]
 * @returns {string[]}
 */
export function geminiModelQueue(primaryOverride) {
  const rawFallbacks = process.env.GEMINI_MODEL_FALLBACKS;
  /** @type {string[]} */
  let extras = [];

  if (rawFallbacks !== undefined) {
    const normalized = String(rawFallbacks).trim().toLowerCase();
    // GEMINI_MODEL_FALLBACKS=none|off|-|false → primary model only
    if (!normalized || ['none', 'off', '-', 'false', '0'].includes(normalized)) {
      extras = [];
    } else {
      extras = String(rawFallbacks)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } else {
    extras = [...BUILTIN_FALLBACKS];
  }

  const list = [primaryModel(primaryOverride), ...extras];
  /** @type {string[]} */
  const seen = [];
  for (const model of list) {
    if (model && !seen.includes(model)) seen.push(model);
  }
  return seen;
}

/**
 * @param {unknown} payload
 * @param {number} status
 */
export function isRateLimitError(payload, status) {
  if (status === 429) return true;
  const message = String(payload?.error?.message || payload?.error?.status || '').toLowerCase();
  const statusText = String(payload?.error?.status || '').toUpperCase();
  return (
    statusText === 'RESOURCE_EXHAUSTED' ||
    message.includes('resource_exhausted') ||
    message.includes('rate limit') ||
    message.includes('quota') ||
    message.includes('too many requests')
  );
}

/**
 * @param {string} text
 */
export function parseModelJson(text) {
  let cleaned = String(text || '').trim();
  // Strip common markdown fences (start/end or whole-line variants)
  cleaned = cleaned
    .replace(/^```(?:json|JSON)?\s*\r?\n?/m, '')
    .replace(/\r?\n?```\s*$/m, '')
    .trim();
  if (/^```/.test(cleaned)) {
    cleaned = cleaned.replace(/```(?:json|JSON)?/gi, '').trim();
  }
  // Normalize curly quotes that models sometimes emit inside JSON strings
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");

  try {
    return JSON.parse(cleaned);
  } catch {
    // Prefer outermost object; fall back to array
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    const candidates = [objMatch?.[0], arrMatch?.[0]].filter(Boolean);
    // Prefer the longer candidate that parses
    candidates.sort((a, b) => b.length - a.length);
    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        /* try next */
      }
    }
    return null;
  }
}

/**
 * Call Gemini generateContent, retrying with fallback models on rate limits.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxOutputTokens]
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model] Primary model override (e.g. GEMINI_MODEL_BASIC for General)
 * @returns {Promise<{ ok: true, parsed: any, text: string, model: string } | { ok: false, error: string, model?: string }>}
 */
export async function generateGeminiJson(opts) {
  const apiKey = opts.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'GEMINI_API_KEY is not set. Add it to your .env file.' };
  }

  const models = geminiModelQueue(opts.model);
  /** @type {string[]} */
  const attempts = [];
  let lastError = 'Gemini request failed';
  let lastModel = models[0];
  const maxOutputTokens = Math.min(16384, Math.max(1024, Number(opts.maxOutputTokens) || 8192));

  for (const model of models) {
    lastModel = model;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
          generationConfig: {
            temperature: opts.temperature ?? 0.3,
            maxOutputTokens,
            responseMimeType: 'application/json',
          },
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          payload?.error?.message ||
          payload?.error?.status ||
          `Gemini API HTTP ${res.status}`;
        lastError = String(message);
        attempts.push(`${model}: ${lastError}`);
        if (isRateLimitError(payload, res.status)) {
          console.warn(`[gemini] rate limited on ${model}, trying next model…`);
          continue;
        }
        return { ok: false, error: lastError, model };
      }

      const text =
        payload?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('\n') ||
        '';
      const parsed = parseModelJson(text);
      if (!parsed) {
        lastError = 'Gemini returned an unreadable response.';
        attempts.push(`${model}: ${lastError}`);
        return { ok: false, error: lastError, model };
      }

      if (attempts.length) {
        console.warn(`[gemini] succeeded with ${model} after fallbacks: ${attempts.join(' | ')}`);
      }
      return { ok: true, parsed, text, model };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      attempts.push(`${model}: ${lastError}`);
      // Network errors: try next model as well
      continue;
    }
  }

  return {
    ok: false,
    error: `All Gemini models were rate-limited or unavailable. Tried: ${attempts.join(' → ') || models.join(', ')}`,
    model: lastModel,
  };
}
