/**
 * Anthropic Claude Messages API helper (JSON responses).
 */
import { parseModelJson, isRateLimitError } from './gemini.js';

/**
 * @param {string} [override]
 * @param {'default'|'basic'} [tier]
 */
function resolveClaudeModel(override, tier = 'default') {
  const custom = typeof override === 'string' ? override.trim() : '';
  if (custom) return custom;
  if (tier === 'basic') {
    return (
      String(process.env.CLAUDE_MODEL_BASIC || '').trim() ||
      String(process.env.CLAUDE_MODEL || '').trim() ||
      'claude-haiku-4-5'
    );
  }
  return String(process.env.CLAUDE_MODEL || '').trim() || 'claude-sonnet-4-5';
}

/**
 * @param {object} payload
 */
function extractClaudeText(payload) {
  if (!Array.isArray(payload?.content)) return '';
  return payload.content
    .filter((block) => block && (block.type === 'text' || typeof block.text === 'string'))
    .map((block) => block.text || '')
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {string} text
 * @param {string} [stopReason]
 */
function unreadableError(text, stopReason) {
  const preview = String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (stopReason === 'max_tokens') {
    return 'Claude response was truncated (max tokens). Try a shorter crawl or raise max tokens.';
  }
  if (!preview) {
    return `Claude returned an empty response${stopReason ? ` (${stopReason})` : ''}.`;
  }
  return `Claude returned an unreadable response${stopReason ? ` (${stopReason})` : ''}: ${preview}`;
}

/**
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxOutputTokens]
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model]
 * @param {'default'|'basic'} [opts.tier]
 * @returns {Promise<{ ok: true, parsed: any, text: string, model: string } | { ok: false, error: string, model?: string }>}
 */
export async function generateClaudeJson(opts) {
  const apiKey =
    opts.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || '';
  if (!apiKey) {
    return {
      ok: false,
      error: 'ANTHROPIC_API_KEY is not set. Add it to your .env file (or set AI_PROVIDER=gemini).',
    };
  }

  const model = resolveClaudeModel(opts.model, opts.tier === 'basic' ? 'basic' : 'default');
  const maxTokens = Math.min(16384, Math.max(1024, Number(opts.maxOutputTokens) || 8192));
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const system =
    'You are a structured-data assistant. Respond with a single valid JSON object only. ' +
    'Do not wrap it in markdown fences. Do not add commentary before or after the JSON.';

  /**
   * @param {Array<{role: string, content: string}>} messages
   */
  async function callOnce(messages) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.3,
        system,
        messages,
      }),
    });
    const payload = await res.json().catch(() => ({}));
    return { res, payload };
  }

  try {
    let { res, payload } = await callOnce([{ role: 'user', content: opts.prompt }]);
    if (!res.ok) {
      const message =
        payload?.error?.message || payload?.error?.type || `Claude API HTTP ${res.status}`;
      const error = String(message);
      if (isRateLimitError(payload, res.status)) {
        console.warn(`[claude] rate limited on ${model}`);
      }
      return { ok: false, error, model };
    }

    let text = extractClaudeText(payload);
    let stopReason = payload?.stop_reason || '';
    let parsed = parseModelJson(text);

    // One repair pass if Claude wrapped/broke JSON
    if (!parsed && text && stopReason !== 'max_tokens') {
      console.warn('[claude] unreadable JSON, retrying once for repair…');
      ({ res, payload } = await callOnce([
        { role: 'user', content: opts.prompt },
        { role: 'assistant', content: text.slice(0, 12000) },
        {
          role: 'user',
          content:
            'Your previous reply was not valid parseable JSON. Reply again with ONLY the corrected JSON object. No markdown fences.',
        },
      ]));
      if (!res.ok) {
        const message =
          payload?.error?.message || payload?.error?.type || `Claude API HTTP ${res.status}`;
        return { ok: false, error: String(message), model };
      }
      text = extractClaudeText(payload);
      stopReason = payload?.stop_reason || stopReason;
      parsed = parseModelJson(text);
    }

    if (!parsed) {
      return { ok: false, error: unreadableError(text, stopReason), model };
    }
    return { ok: true, parsed, text, model };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, model };
  }
}
