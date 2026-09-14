/**
 * Selectable Gemini / agent models for the UI and API.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** Antigravity managed agent id (Interactions API). */
export const ANTIGRAVITY_AGENT = 'antigravity-preview-05-2026';

/** @type {readonly { id: string, label: string }[]} */
export const GEMINI_MODELS = Object.freeze([
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: ANTIGRAVITY_AGENT, label: 'Antigravity' },
]);

const ALLOWED = new Set(GEMINI_MODELS.map((m) => m.id));

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function resolveGeminiModel(raw) {
  const id = String(raw || '').trim();
  if (ALLOWED.has(id)) return id;
  const fromEnv = String(process.env.GEMINI_MODEL || '').trim();
  if (ALLOWED.has(fromEnv)) return fromEnv;
  return DEFAULT_GEMINI_MODEL;
}

/**
 * @param {string} model
 * @returns {boolean}
 */
export function isAntigravityModel(model) {
  return String(model || '').trim() === ANTIGRAVITY_AGENT;
}
