/**
 * Load markdown prompt sources from the embedded bundle (Workers-safe).
 * After editing `*.md`, run: npm run embed:prompts
 */

import { EMBEDDED_PROMPTS } from './embedded.js';

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * @param {string} name - Filename with or without `.md` (e.g. `tech-quickscan`)
 * @returns {string}
 */
export function readPromptSource(name) {
  const file = name.endsWith('.md') ? name : `${name}.md`;
  let text = cache.get(file);
  if (text != null) return text;

  text = EMBEDDED_PROMPTS[file];
  if (text == null) {
    throw new Error(`Prompt not found: ${file}. Run npm run embed:prompts`);
  }
  cache.set(file, text);
  return text;
}

/**
 * Build a full prompt from a markdown source file.
 * @param {string} name
 * @param {{ context?: string }} [vars]
 * @returns {string}
 */
export function loadPrompt(name, vars = {}) {
  const source = readPromptSource(name);
  const context = vars.context != null ? String(vars.context) : '';

  if (source.includes('{{context}}')) {
    return source.replaceAll('{{context}}', context);
  }

  if (context) {
    return `${source}\n\n## Website context\n\n${context}`;
  }

  return source;
}
