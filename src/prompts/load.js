/**
 * Load markdown prompt sources from this directory.
 * Use {{context}} in a prompt file to inject crawl/HTML context at call time.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROMPTS_DIR = dirname(fileURLToPath(import.meta.url));

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * @param {string} name - Filename with or without `.md` (e.g. `tech-quickscan`)
 * @returns {string}
 */
export function readPromptSource(name) {
  const file = name.endsWith('.md') ? name : `${name}.md`;
  let text = cache.get(file);
  if (text == null) {
    text = readFileSync(join(PROMPTS_DIR, file), 'utf8').trim();
    cache.set(file, text);
  }
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
