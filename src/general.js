/**
 * AI-powered general company intake fields for the General tab.
 * Fields that cannot be evidenced from the site stay empty for the user to fill.
 */

import { generateAiJson, isAiConfigured, missingAiKeyError } from './ai.js';
import { loadPrompt } from './prompts/load.js';

/** @typedef {typeof GENERAL_FIELD_KEYS[number]} GeneralFieldKey */

export const GENERAL_FIELD_KEYS = /** @type {const} */ ([
  'companyNameWebsite',
  'coreOffering',
  'pricingBrands',
  'locations',
  'searchTerms',
  'competitors',
  'rawData',
]);

/**
 * @typedef {object} GeneralResult
 * @property {boolean} ok
 * @property {string} companyNameWebsite
 * @property {string} coreOffering
 * @property {string} pricingBrands
 * @property {string} locations
 * @property {string} searchTerms
 * @property {string} competitors
 * @property {string} rawData
 * @property {string|null} [error]
 * @property {string} [model]
 */

/**
 * @returns {Omit<GeneralResult, 'ok'|'error'|'model'>}
 */
function emptyFields() {
  return {
    companyNameWebsite: '',
    coreOffering: '',
    pricingBrands: '',
    locations: '',
    searchTerms: '',
    competitors: '',
    rawData: '',
  };
}

/**
 * @param {object} input
 * @param {string} input.url
 * @param {string} [input.homepageHtml]
 * @param {import('./analyze.js').PageAnalysis[]} [input.pages]
 * @param {import('./llms.js').LlmsAnalysis} [input.llms]
 * @param {object} [input.summary]
 * @param {string} [input.model]
 * @returns {Promise<GeneralResult>}
 */
export async function runGeneral(input) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      ...emptyFields(),
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
    model: input.model,
  });
  if (!result.ok) {
    return {
      ok: false,
      ...emptyFields(),
      error: result.error,
      model: result.model,
    };
  }

  const parsed = result.parsed && typeof result.parsed === 'object' ? result.parsed : {};
  const fields = normalizeFields(parsed);

  // rawData is always user-owned; never trust model output
  fields.rawData = '';

  // Prefer the crawled start URL when the model omitted the website
  if (!fields.companyNameWebsite && input.url) {
    fields.companyNameWebsite = String(input.url);
  } else if (fields.companyNameWebsite && input.url && !/\bhttps?:\/\//i.test(fields.companyNameWebsite)) {
    fields.companyNameWebsite = `${fields.companyNameWebsite} — ${input.url}`;
  }

  return {
    ok: true,
    ...fields,
    error: null,
    model: result.model,
  };
}

/**
 * @param {Record<string, unknown>} parsed
 */
function normalizeFields(parsed) {
  const out = emptyFields();
  for (const key of GENERAL_FIELD_KEYS) {
    out[key] = toFieldText(parsed[key]);
  }
  return out;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function toFieldText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const obj = /** @type {Record<string, unknown>} */ (item);
          return String(obj.business || obj.tech || obj.text || '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    return String(obj.business || obj.tech || obj.text || '').trim();
  }
  return String(value).trim();
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
    if (/about|over-ons|over ons|diensten|services|product|shop|contact|prijs|pricing|merk|brand|locatie|vestiging|case|referentie|faq/i.test(`${path} ${title}`)) {
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
      if (/Organization|LocalBusiness|Corporation|WebSite|Product|Service|Offer|Brand|Store/i.test(block)) {
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
