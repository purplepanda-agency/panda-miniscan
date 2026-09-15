/**
 * Auto-generate src/prompts/embedded.js from markdown sources.
 * Run after editing prompts: npm run embed:prompts
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const promptsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'prompts');
const files = readdirSync(promptsDir)
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .sort();

const entries = files.map((file) => {
  const text = readFileSync(join(promptsDir, file), 'utf8').trim();
  return `  ${JSON.stringify(file)}: ${JSON.stringify(text)}`;
});

const out = `/**
 * Auto-generated prompt sources for Cloudflare Workers (no runtime fs).
 * Regenerate with: npm run embed:prompts
 */
export const EMBEDDED_PROMPTS = {
${entries.join(',\n')}
};
`;

writeFileSync(join(promptsDir, 'embedded.js'), out);
console.log(`Embedded ${files.length} prompt(s) → src/prompts/embedded.js`);
