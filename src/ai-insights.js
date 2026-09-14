/**
 * AI Insights — Gemini-powered research cards for the Insights tab.
 * Always uses Gemini (not the global AI_PROVIDER switch).
 */

import { generateGeminiJson } from './gemini.js';
import { loadPrompt } from './prompts/load.js';

/** @type {Record<string, string>} */
export const AI_INSIGHT_CATEGORIES = {
  online_visibility: 'Online vindbaarheid',
  content_clarity: 'Content & conversie',
  technical: 'Technisch',
  quick_wins: 'Quick wins',
};

/**
 * @typedef {object} AiInsightCard
 * @property {string} id
 * @property {'online_visibility'|'content_clarity'|'technical'|'quick_wins'} category
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
    temperature: 0.22,
    maxOutputTokens: 8192,
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
    if (/about|over-ons|over ons|diensten|services|product|shop|contact|prijs|pricing|case|referentie|faq|blog|nieuws/i.test(`${path} ${title}`)) {
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
      if (/Organization|LocalBusiness|Corporation|WebSite|Product|Service|Offer|BreadcrumbList|FAQPage/i.test(block)) {
        orgHints.push(String(block).slice(0, 1000));
      }
    }
  }

  const general = input.general;
  const generalLines = [];
  if (general?.ok) {
    for (const item of general.companyInfo || []) {
      generalLines.push(`- ${item.business || item.tech || ''}`);
    }
    for (const item of general.mainServices || []) {
      generalLines.push(`- dienst: ${item.business || item.tech || ''}`);
    }
  }

  const channels = input.channels;
  const channelLines = [];
  if (channels?.ok && Array.isArray(channels.channels)) {
    for (const ch of channels.channels.slice(0, 12)) {
      channelLines.push(`- ${ch.label || ch.platform || 'channel'}: ${ch.url || ''}`);
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
    generalLines.length ? `General overview (from earlier analysis):\n${generalLines.join('\n')}` : '',
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

  const rawCategory = String(obj.category || '').trim();
  const category =
    rawCategory === 'online_visibility' ||
    rawCategory === 'content_clarity' ||
    rawCategory === 'technical' ||
    rawCategory === 'quick_wins'
      ? rawCategory
      : null;
  if (!category) return null;

  const finding = String(obj.finding || obj.constatatie || obj.title || '').trim();
  const explanation = String(obj.explanation || obj.uitleg || obj.detail || '').trim();
  const suggestions = String(
    obj.suggestions || obj.suggesties || obj.oplossingen || obj.recommendations || '',
  ).trim();

  if (!finding && !explanation) return null;

  return {
    id:
      typeof obj.id === 'string' && obj.id
        ? obj.id
        : `insight-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category,
    categoryLabel: AI_INSIGHT_CATEGORIES[category] || category,
    finding: finding || explanation.slice(0, 120),
    explanation: explanation || finding,
    suggestions,
  };
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
  for (const item of value) {
    const card = toCard(item);
    if (!card) continue;
    const key = `${card.category}::${card.finding.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(card);
    if (out.length >= 12) break;
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
