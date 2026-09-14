/**
 * AI provider router — switch with AI_PROVIDER=gemini|claude in .env.
 * Gemini remains the default so existing setups keep working.
 */
import { generateGeminiJson } from './gemini.js';
import { generateClaudeJson } from './claude.js';

/**
 * Optional per-page AI polish hook (legacy). Currently a no-op passthrough.
 * @param {import('./analyze.js').PageAnalysis} report
 * @returns {Promise<import('./analyze.js').PageAnalysis>}
 */
export async function enhanceWithAI(report) {
  return report;
}

/**
 * @returns {'gemini'|'claude'}
 */
export function getAiProvider() {
  const raw = String(process.env.AI_PROVIDER || process.env.LLM_PROVIDER || 'gemini')
    .trim()
    .toLowerCase();
  if (raw === 'claude' || raw === 'anthropic') return 'claude';
  return 'gemini';
}

/**
 * @returns {boolean}
 */
export function isAiConfigured() {
  if (getAiProvider() === 'claude') {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
  }
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/**
 * @param {string} feature
 */
export function missingAiKeyError(feature) {
  if (getAiProvider() === 'claude') {
    return `ANTHROPIC_API_KEY is not set. Add it to your .env file to enable ${feature} (or set AI_PROVIDER=gemini).`;
  }
  return `GEMINI_API_KEY is not set. Add it to your .env file to enable ${feature}.`;
}

/**
 * Unified JSON generation used by General / Quickscans / rechecks.
 * @param {object} opts
 * @param {string} opts.prompt
 * @param {number} [opts.temperature]
 * @param {number} [opts.maxOutputTokens]
 * @param {string} [opts.apiKey]
 * @param {string} [opts.model] Explicit model override
 * @param {'default'|'basic'} [opts.tier] Use basic model env (General overview)
 * @returns {Promise<{ ok: true, parsed: any, text: string, model: string } | { ok: false, error: string, model?: string }>}
 */
export async function generateAiJson(opts) {
  const provider = getAiProvider();
  if (provider === 'claude') {
    return generateClaudeJson(opts);
  }

  // Gemini: map tier=basic → GEMINI_MODEL_BASIC unless model already set
  let model = opts.model;
  if (!model && opts.tier === 'basic') {
    model =
      String(process.env.GEMINI_MODEL_BASIC || '').trim() ||
      String(process.env.GEMINI_MODEL || '').trim() ||
      undefined;
  }
  return generateGeminiJson({ ...opts, model });
}
