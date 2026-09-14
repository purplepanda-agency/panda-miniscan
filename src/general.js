/**
 * AI-powered general company / services / presence overview.
 * Each line is returned in both Business developer and Tech expert wording.
 */

import { generateAiJson, isAiConfigured, missingAiKeyError } from './ai.js';
import { loadPrompt } from './prompts/load.js';

/**
 * @typedef {{ business: string, tech: string }} DualText
 *
 * @typedef {object} GeneralResult
 * @property {boolean} ok
 * @property {DualText[]} companyInfo
 * @property {DualText[]} mainServices
 * @property {DualText[]} onlinePresence
 * @property {string|null} [error]
 * @property {string} [model]
 */

/**
 * @param {object} input
 * @param {string} input.url
 * @param {string} [input.homepageHtml]
 * @param {import('./analyze.js').PageAnalysis[]} [input.pages]
 * @param {import('./llms.js').LlmsAnalysis} [input.llms]
 * @param {object} [input.summary]
 * @returns {Promise<GeneralResult>}
 */
export async function runGeneral(input) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      companyInfo: [],
      mainServices: [],
      onlinePresence: [],
      error: missingAiKeyError('General overview'),
    };
  }

  const context = buildContext(input);
  const prompt = loadPrompt('general', { context });

  const result = await generateAiJson({
    prompt,
    temperature: 0.2,
    tier: 'basic',
    maxOutputTokens: 4096,
  });
  if (!result.ok) {
    return {
      ok: false,
      companyInfo: [],
      mainServices: [],
      onlinePresence: [],
      error: result.error,
      model: result.model,
    };
  }

  const parsed = result.parsed;
  return {
    ok: true,
    companyInfo: toDualList(parsed.companyInfo, 3),
    mainServices: toDualList(parsed.mainServices, 8),
    onlinePresence: toDualList(parsed.onlinePresence, 4),
    error: null,
    model: result.model,
  };
}

/**
 * Prefer readable page text over raw HTML noise for the model.
 * @param {string} html
 * @param {number} max
 */
function readableExcerpt(html, max = 8000) {
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
  const excerpt = readableExcerpt(input.homepageHtml, 8000);

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
    if (/about|over-ons|over ons|diensten|services|product|shop|contact|prijs|pricing|case|referentie|faq/i.test(`${path} ${title}`)) {
      navHints.push(`${path} — ${title}`);
    }
  }

  const pageLines = pages.slice(0, 20).map((p) => {
    const types = (p.types || []).join(', ') || 'none';
    return `- ${p.url} | score=${p.score ?? 'n/a'} | jsonld=${types} | title=${p.meta?.title || ''}`;
  });

  const orgHints = [];
  for (const p of pages.slice(0, 10)) {
    for (const block of p.jsonLd || []) {
      if (/Organization|LocalBusiness|Corporation|WebSite|Product|Service|Offer/i.test(block)) {
        orgHints.push(String(block).slice(0, 1200));
      }
    }
  }

  return [
    `URL: ${input.url}`,
    `Crawl summary: ${JSON.stringify(input.summary || {})}`,
    `llms.txt: ${input.llms?.found ? `found score=${input.llms.score}` : 'missing'}`,
    `Home title: ${home?.meta?.title || ''}`,
    `Home description: ${home?.meta?.description || ''}`,
    `Site name / OG: ${home?.meta?.siteName || ''} / ${home?.meta?.ogTitle || ''}`,
    navHints.length
      ? `Likely key pages (path — title):\n${[...new Set(navHints)].slice(0, 12).join('\n')}`
      : '',
    `Sample pages:\n${pageLines.join('\n') || '(none)'}`,
    orgHints.length
      ? `JSON-LD org/product/service excerpts:\n${orgHints.slice(0, 4).join('\n---\n')}`
      : '',
    `Homepage text excerpt (scripts/styles stripped):\n${excerpt || '(unavailable)'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * @param {unknown} value
 * @returns {DualText|null}
 */
function toDual(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { business: text, tech: text } : null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const business = String(obj.business || obj.Business || obj.text || '').trim();
    const tech = String(obj.tech || obj.Tech || obj.text || business).trim();
    if (!business && !tech) return null;
    return { business: business || tech, tech: tech || business };
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {number} max
 * @returns {DualText[]}
 */
function toDualList(value, max) {
  if (!Array.isArray(value)) {
    if (typeof value === 'string') {
      return value
        .split(/\n+/)
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, max)
        .map((text) => ({ business: text, tech: text }));
    }
    return [];
  }
  /** @type {DualText[]} */
  const out = [];
  for (const item of value) {
    const dual = toDual(item);
    if (dual) out.push(dual);
    if (out.length >= max) break;
  }
  return out;
}
