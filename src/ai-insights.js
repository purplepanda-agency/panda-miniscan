/**
 * AI Insights — Gemini-powered research cards for the Insights tab.
 * Always uses Gemini (not the global AI_PROVIDER switch).
 */

import { generateGeminiJson } from './gemini.js';
import { loadPrompt } from './prompts/load.js';

/** @type {Record<string, string>} */
export const AI_INSIGHT_CATEGORIES = {
  visibility: 'Vindbaarheid',
  presence_trust: 'Aanwezigheid en vertrouwen',
  conversion: 'Conversie, online en naar de winkel',
  // legacy reports
  online_visibility: 'Vindbaarheid',
  content_clarity: 'Conversie, online en naar de winkel',
  technical: 'Aanwezigheid en vertrouwen',
  quick_wins: 'Vindbaarheid',
};

/** @type {('visibility'|'presence_trust'|'conversion')[]} */
export const AI_INSIGHT_BLOCK_ORDER = ['visibility', 'presence_trust', 'conversion'];

/**
 * @typedef {object} AiInsightCard
 * @property {string} id
 * @property {string} category
 * @property {string} categoryLabel
 * @property {string} finding
 * @property {string} explanation
 * @property {string} suggestions
 */

/**
 * @typedef {object} AiInsightsResult
 * @property {boolean} ok
 * @property {AiInsightCard[]} cards
 * @property {string|null} generatedAt
 * @property {string|null} [error]
 * @property {string} [model]
 */

/**
 * @returns {boolean}
 */
export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

/**
 * @param {string} category
 * @returns {'visibility'|'presence_trust'|'conversion'|null}
 */
export function insightBlockKey(category) {
  const raw = String(category || '').trim();
  if (raw === 'visibility' || raw === 'presence_trust' || raw === 'conversion') return raw;
  if (raw === 'online_visibility' || raw === 'quick_wins') return 'visibility';
  if (raw === 'content_clarity') return 'conversion';
  if (raw === 'technical') return 'presence_trust';
  return null;
}

/**
 * @param {object} input
 * @param {string} input.url
 * @param {string} [input.homepageHtml]
 * @param {import('./analyze.js').PageAnalysis[]} [input.pages]
 * @param {import('./llms.js').LlmsAnalysis} [input.llms]
 * @param {object} [input.summary]
 * @param {object|null} [input.general]
 * @param {object|null} [input.channels]
 * @returns {Promise<AiInsightsResult>}
 */
export async function runAiInsights(input) {
  if (!isGeminiConfigured()) {
    return {
      ok: false,
      cards: [],
      generatedAt: null,
      error: 'GEMINI_API_KEY is not set. Add it to your .env file to enable AI insights.',
    };
  }

  const context = buildContext(input);
  const prompt = loadPrompt('ai-insights', { context });

  const result = await generateGeminiJson({
    prompt,
    temperature: 0.28,
    maxOutputTokens: 12288,
    model: input.model,
  });

  if (!result.ok) {
    return {
      ok: false,
      cards: [],
      generatedAt: null,
      error: result.error,
      model: result.model,
    };
  }

  const cards = toCardList(result.parsed?.cards);
  if (!cards.length) {
    return {
      ok: false,
      cards: [],
      generatedAt: new Date().toISOString(),
      error: 'Geen onderbouwde bevindingen gegenereerd op basis van de beschikbare context.',
      model: result.model,
    };
  }
  return {
    ok: true,
    cards,
    generatedAt: new Date().toISOString(),
    error: null,
    model: result.model,
  };
}

/**
 * @param {string} html
 * @param {number} max
 */
function readableExcerpt(html, max = 6000) {
  const raw = String(html || '');
  if (!raw.trim()) return '';

  let text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (text.length < 200) {
    text = raw.replace(/\s+/g, ' ').trim();
  }

  return text.slice(0, max);
}

/**
 * @param {object} input
 */
function buildContext(input) {
  const pages = input.pages || [];
  const home = pages[0];
  const excerpt = readableExcerpt(input.homepageHtml, 6000);

  const navHints = [];
  for (const p of pages.slice(0, 25)) {
    const title = p.meta?.title || '';
    const path = (() => {
      try {
        return new URL(p.url).pathname;
      } catch {
        return p.url;
      }
    })();
    if (/about|over-ons|over ons|diensten|services|product|shop|contact|prijs|pricing|merk|brand|locatie|vestiging|case|referentie|faq|blog|nieuws|review|afspraak|winkel/i.test(`${path} ${title}`)) {
      navHints.push(`${path} — ${title}`);
    }
  }

  const pageLines = pages.slice(0, 20).map((p) => {
    const types = (p.types || []).join(', ') || 'none';
    const issues = Array.isArray(p.issues) && p.issues.length ? ` | issues=${p.issues.slice(0, 2).join('; ')}` : '';
    const fetchErr = p.fetchError ? ` | fetchError=${p.fetchError}` : '';
    return `- ${p.url} | score=${p.score ?? 'n/a'} | jsonld=${types} | title=${p.meta?.title || ''}${issues}${fetchErr}`;
  });

  const orgHints = [];
  for (const p of pages.slice(0, 10)) {
    for (const block of p.jsonLd || []) {
      if (/Organization|LocalBusiness|Corporation|WebSite|Product|Service|Offer|BreadcrumbList|FAQPage|AggregateRating|Review/i.test(block)) {
        orgHints.push(String(block).slice(0, 1000));
      }
    }
  }

  const general = input.general;
  const generalLines = [];
  if (general?.ok) {
    const pushField = (label, value) => {
      const text = value != null ? String(value).trim() : '';
      if (text) generalLines.push(`- ${label}: ${text}`);
    };
    pushField('bedrijfsnaam/website', general.companyNameWebsite);
    pushField('kernaanbod', general.coreOffering);
    pushField('prijs/merken', general.pricingBrands);
    pushField('locaties', general.locations);
    pushField('zoektermen', general.searchTerms);
    pushField('concurrenten (intake)', general.competitors);
    pushField('ruwe data', general.rawData);
  }

  const channels = input.channels;
  const channelLines = [];
  if (channels?.ok && Array.isArray(channels.channels)) {
    for (const ch of channels.channels.slice(0, 16)) {
      const extra = ch.note || ch.snippet ? ` (${[ch.note, ch.snippet].filter(Boolean).join(' · ')})` : '';
      channelLines.push(`- ${ch.label || ch.platform || 'channel'}: ${ch.url || ''}${extra}`);
    }
  }

  const summary = input.summary || {};
  const crawled = summary.crawled ?? pages.length;
  const withJson = summary.withJsonLd ?? pages.filter((p) => p.types?.length).length;

  return [
    `URL: ${input.url}`,
    `Crawl summary: crawled=${crawled}, withJsonLd=${withJson}, withoutJsonLd=${summary.withoutJsonLd ?? 'n/a'}`,
    `llms.txt: ${input.llms?.found ? `found score=${input.llms.score}` : 'missing'}`,
    `Home title: ${home?.meta?.title || ''}`,
    `Home description: ${home?.meta?.description || ''}`,
    `Site name / OG: ${home?.meta?.siteName || ''} / ${home?.meta?.ogTitle || ''}`,
    navHints.length
      ? `Likely key pages (path — title):\n${[...new Set(navHints)].slice(0, 12).join('\n')}`
      : '',
    `Sample pages:\n${pageLines.join('\n') || '(none)'}`,
    orgHints.length
      ? `JSON-LD excerpts:\n${orgHints.slice(0, 4).join('\n---\n')}`
      : '',
    generalLines.length ? `General intake (from earlier analysis):\n${generalLines.join('\n')}` : '',
    channelLines.length ? `Detected channels:\n${channelLines.join('\n')}` : '',
    `Homepage text excerpt:\n${excerpt || '(unavailable)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * @param {unknown} value
 * @returns {AiInsightCard|null}
 */
function toCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = /** @type {Record<string, unknown>} */ (value);

  const rawCategory = String(obj.category || obj.block || obj.blok || '').trim();
  const block = insightBlockKey(rawCategory);
  if (!block) return null;

  let finding = String(obj.point || obj.lead || obj.heading || obj.finding || obj.constatatie || obj.title || '').trim();
  let explanation = String(obj.explanation || obj.uitleg || obj.detail || '').trim();
  if (!finding && !explanation) {
    finding = String(obj.text || '').trim();
  }

  if (finding && explanation && finding === explanation) explanation = '';

  if (!explanation && finding) {
    const split = splitInsightLeadAndText(finding);
    finding = split.lead;
    explanation = split.text;
  }

  if (!finding && explanation) {
    const split = splitInsightLeadAndText(explanation);
    finding = split.lead;
    explanation = split.text;
  }

  if (!finding && !explanation) return null;

  return {
    id:
      typeof obj.id === 'string' && obj.id
        ? obj.id
        : `insight-${block}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: block,
    categoryLabel: AI_INSIGHT_CATEGORIES[block] || block,
    finding,
    explanation,
    suggestions: '',
  };
}

/**
 * @param {string} combined
 * @returns {{ lead: string, text: string }}
 */
function splitInsightLeadAndText(combined) {
  const raw = String(combined || '').trim();
  if (!raw) return { lead: '', text: '' };
  const sentence = raw.match(/^(.+?[.!?])(\s+(.+))$/s);
  if (sentence && sentence[1].length <= 120) {
    return { lead: sentence[1].trim(), text: (sentence[3] || '').trim() };
  }
  if (raw.length > 100) {
    const space = raw.indexOf(' ', 65);
    if (space > 20) {
      return { lead: `${raw.slice(0, space).trim()}…`, text: raw };
    }
  }
  return { lead: raw, text: '' };
}

/**
 * @param {unknown} value
 * @returns {AiInsightCard[]}
 */
function toCardList(value) {
  if (!Array.isArray(value)) return [];
  /** @type {AiInsightCard[]} */
  const out = [];
  const seen = new Set();
  /** @type {Record<string, number>} */
  const perBlock = {};
  for (const item of value) {
    const card = toCard(item);
    if (!card) continue;
    const block = card.category;
    perBlock[block] = (perBlock[block] || 0) + 1;
    if (perBlock[block] > 3) continue;
    const key = `${block}::${card.finding.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length >= 9) break;
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {AiInsightsResult}
 */
export function normalizeAiInsights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, cards: [], generatedAt: null, error: null };
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const cards = Array.isArray(obj.cards) ? obj.cards.map(toCard).filter((c) => c != null) : [];
  return {
    ok: obj.ok !== false && cards.length > 0,
    cards,
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : null,
    error: obj.error != null ? String(obj.error) : null,
    model: obj.model != null ? String(obj.model) : undefined,
  };
}
