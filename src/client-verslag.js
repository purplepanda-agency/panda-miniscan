/**
 * Client verslag — synthesize AI insights, quick wins, and consultant notes.
 */

import { generateGeminiJson } from './gemini.js';
import { loadPrompt } from './prompts/load.js';
import { AI_INSIGHT_CATEGORIES, insightBlockKey } from './ai-insights.js';

/**
 * @typedef {object} VerslagItem
 * @property {string} lead
 * @property {string} text
 */

/**
 * @typedef {object} VerslagBlock
 * @property {'visibility'|'presence_trust'|'conversion'} key
 * @property {string} title
 * @property {VerslagItem[]} items
 */

/**
 * @typedef {object} ClientVerslagResult
 * @property {boolean} ok
 * @property {string} intro
 * @property {VerslagBlock[]} blocks
 * @property {VerslagItem[]} quickWins
 * @property {VerslagItem[]} ownFindings
 * @property {string|null} generatedAt
 * @property {string|null} [error]
 * @property {string} [model]
 */

/**
 * @param {object} input
 * @param {string} input.url
 * @param {object|null} [input.general]
 * @param {object|null} [input.aiInsights]
 * @param {string} [input.notesHtml]
 * @param {object[]} [input.savedNotes]
 * @param {object|null} [input.channels]
 * @returns {Promise<ClientVerslagResult>}
 */
export async function runClientVerslag(input) {
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
    return emptyVerslag('GEMINI_API_KEY is not set. Add it to your .env file to enable the client report.');
  }

  const hasInsights = Boolean(input.aiInsights?.ok && input.aiInsights?.cards?.length);
  const notesPlain = collectNotesPlain(input);
  if (!hasInsights && !notesPlain.trim()) {
    return emptyVerslag('Genereer eerst AI insights of schrijf notities voordat u een verslag maakt.');
  }

  const context = buildVerslagContext(input, notesPlain);
  const prompt = loadPrompt('client-verslag', { context });

  const result = await generateGeminiJson({
    prompt,
    temperature: 0.25,
    maxOutputTokens: 8192,
    model: input.model,
  });

  if (!result.ok) {
    return { ...emptyVerslag(result.error || 'Verslag genereren mislukt'), model: result.model };
  }

  const parsed = result.parsed && typeof result.parsed === 'object' ? result.parsed : {};
  return {
    ok: true,
    intro: String(parsed.intro || '').trim(),
    blocks: normalizeBlocks(parsed.blocks),
    quickWins: normalizeQuickWinsList(parsed.quickWins),
    ownFindings: normalizeOwnFindings(parsed.ownFindings, parsed.notesSection),
    generatedAt: new Date().toISOString(),
    error: null,
    model: result.model,
  };
}

/**
 * @param {string|null} error
 * @returns {ClientVerslagResult}
 */
function emptyVerslag(error) {
  return {
    ok: false,
    intro: '',
    blocks: [],
    quickWins: [],
    ownFindings: [],
    generatedAt: null,
    error,
  };
}

/**
 * @param {object} input
 * @param {string} notesPlain
 */
function buildVerslagContext(input, notesPlain) {
  const lines = [`Website: ${input.url}`];

  const general = input.general;
  if (general?.ok) {
    lines.push('', 'General intake:');
    for (const [label, key] of [
      ['Bedrijfsnaam/website', 'companyNameWebsite'],
      ['Kernaanbod', 'coreOffering'],
      ['Prijspositionering/merken', 'pricingBrands'],
      ['Locaties', 'locations'],
      ['Zoektermen', 'searchTerms'],
      ['Concurrenten', 'competitors'],
    ]) {
      const val = general[key] != null ? String(general[key]).trim() : '';
      if (val) lines.push(`- ${label}: ${val}`);
    }
  }

  const insights = input.aiInsights;
  if (insights?.ok && Array.isArray(insights.cards)) {
    lines.push('', 'AI insights (gebruik als basis voor blocks — geen nieuwe feiten):');
    for (const card of insights.cards) {
      const block = insightBlockKey(card.category) || card.category;
      const title = AI_INSIGHT_CATEGORIES[block] || block;
      const lead = String(card.finding || card.point || '').trim();
      const text = String(card.explanation || '').trim();
      lines.push(`- [${title}] ${lead}${text ? ` — ${text}` : ''}`);
    }
  }

  if (notesPlain.trim()) {
    lines.push('', 'Ruwe notities consultant (herformuleer in ownFindings.items, voeg geen feiten toe):');
    lines.push(notesPlain.trim());
  }

  const saved = input.savedNotes;
  if (Array.isArray(saved) && saved.length) {
    lines.push('', 'Opgeslagen notitie-snapshots:');
    for (const note of saved.slice(-5)) {
      const plain = htmlToPlain(String(note.html || ''));
      if (plain.trim()) lines.push(`---\n${plain.trim()}\n---`);
    }
  }

  const channels = input.channels;
  if (channels?.ok && Array.isArray(channels.channels) && channels.channels.length) {
    lines.push('', 'Kanalen (referentie):');
    for (const ch of channels.channels.slice(0, 10)) {
      lines.push(`- ${ch.label || ch.platform || 'kanaal'}: ${ch.url || ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * @param {object} input
 */
function collectNotesPlain(input) {
  const parts = [];
  const html = String(input.notesHtml || '');
  const fromEditor = htmlToPlain(html);
  if (fromEditor.trim()) parts.push(fromEditor.trim());

  if (Array.isArray(input.savedNotes)) {
    for (const note of input.savedNotes) {
      const plain = htmlToPlain(String(note.html || ''));
      if (plain.trim()) parts.push(plain.trim());
    }
  }
  return [...new Set(parts)].join('\n\n');
}

/**
 * @param {string} html
 */
function htmlToPlain(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {unknown} value
 * @returns {VerslagBlock[]}
 */
function normalizeBlocks(value) {
  if (!Array.isArray(value)) return [];
  /** @type {VerslagBlock[]} */
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = /** @type {Record<string, unknown>} */ (raw);
    const key = insightBlockKey(String(obj.key || obj.category || ''));
    if (!key) continue;
    const items = normalizeItems(obj.items);
    if (!items.length) continue;
    out.push({
      key,
      title: AI_INSIGHT_CATEGORIES[key] || key,
      items: items.slice(0, 3),
    });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {VerslagItem[]}
 */
function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  /** @type {VerslagItem[]} */
  const out = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) out.push({ lead: text, text: '' });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const obj = /** @type {Record<string, unknown>} */ (raw);
    const lead = String(obj.lead || obj.point || obj.finding || obj.title || '').trim();
    const text = String(obj.text || obj.detail || obj.explanation || '').trim();
    if (!lead && !text) continue;
    out.push({ lead: lead || text.slice(0, 60), text: lead && text ? text : '' });
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {VerslagItem[]}
 */
function normalizeQuickWinsList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {VerslagItem[]} */
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = /** @type {Record<string, unknown>} */ (raw);
    const lead = String(obj.lead || obj.point || obj.title || '').trim();
    const text = String(obj.detail || obj.text || obj.explanation || '').trim();
    if (!lead && !text) continue;
    out.push({ lead: lead || text.slice(0, 50), text: text || '' });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * @param {unknown} ownFindings
 * @param {unknown} notesSection legacy
 * @returns {VerslagItem[]}
 */
function normalizeOwnFindings(ownFindings, notesSection) {
  if (ownFindings && typeof ownFindings === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (ownFindings);
    const items = normalizeItems(obj.items ?? ownFindings);
    if (items.length) return items.slice(0, 5);
  }
  if (!notesSection || typeof notesSection !== 'object') return [];
  const legacy = /** @type {Record<string, unknown>} */ (notesSection);
  if (!Array.isArray(legacy.paragraphs)) return [];
  /** @type {VerslagItem[]} */
  const out = [];
  for (const p of legacy.paragraphs) {
    const para = String(p || '').trim();
    if (!para) continue;
    const split = splitLeadAndText(para);
    out.push({ lead: split.lead, text: split.text });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * @param {string} combined
 * @returns {{ lead: string, text: string }}
 */
function splitLeadAndText(combined) {
  const raw = String(combined || '').trim();
  if (!raw) return { lead: '', text: '' };
  const m = raw.match(/^(.+?[.!?])(\s+([\s\S]+))?$/);
  if (m && m[1].length <= 100) {
    return { lead: m[1].trim(), text: (m[3] || '').trim() };
  }
  if (raw.length > 90) {
    const space = raw.indexOf(' ', 70);
    if (space > 20) return { lead: `${raw.slice(0, space).trim()}…`, text: raw };
  }
  return { lead: raw, text: '' };
}

/**
 * @param {unknown} value
 * @returns {ClientVerslagResult}
 */
export function normalizeClientVerslag(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return emptyVerslag(null);
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const blocks = Array.isArray(obj.blocks)
    ? normalizeBlocks(obj.blocks)
    : [];
  const quickWins = Array.isArray(obj.quickWins) ? normalizeQuickWinsList(obj.quickWins) : [];
  const ownFindings = Array.isArray(obj.ownFindings)
    ? normalizeItems(obj.ownFindings).slice(0, 5)
    : normalizeOwnFindings(obj.ownFindings, obj.notesSection);
  const ok =
    obj.ok !== false &&
    Boolean(String(obj.intro || '').trim() || blocks.length || quickWins.length || ownFindings.length);
  return {
    ok,
    intro: String(obj.intro || '').trim(),
    blocks,
    quickWins,
    ownFindings,
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : null,
    error: obj.error != null ? String(obj.error) : null,
    model: obj.model != null ? String(obj.model) : undefined,
  };
}
