import { flattenEntities } from './extract.js';
import { TYPE_RULES, hasField, normalizeTypes } from './rules/types.js';
import { suggestForPage } from './suggest.js';
import { enhanceWithAI } from './ai.js';

/**
 * @typedef {import('./extract.js').ExtractedPage} ExtractedPage
 * @typedef {import('./extract.js').PageMeta} PageMeta
 */

/**
 * @typedef {object} PageAnalysis
 * @property {string} url
 * @property {number} [status]
 * @property {string} [fetchError]
 * @property {boolean} hasJsonLd
 * @property {string[]} types
 * @property {number|null} score
 * @property {string[]} issues
 * @property {string[]} enhancements
 * @property {string|null} [verdict]
 * @property {string[]} [jsonLd]
 * @property {object|null} [suggestion]
 * @property {string|null} [suggestionScript]
 * @property {PageMeta} [meta]
 * @property {string[]} [parseErrors]
 */

/**
 * @param {Record<string, unknown>} entity
 * @param {PageMeta} meta
 * @param {string} pageUrl
 */
function checkEntity(entity, meta, pageUrl) {
  /** @type {string[]} */
  const issues = [];
  /** @type {string[]} */
  const enhancements = [];
  let earned = 0;
  let possible = 0;

  const types = normalizeTypes(entity['@type']);
  if (types.length === 0) {
    issues.push('Entity missing @type');
    return { issues, enhancements, earned: 0, possible: 10 };
  }

  const ctx = entity['@context'];
  possible += 10;
  if (ctx) {
    const ctxStr = Array.isArray(ctx) ? ctx.join(' ') : String(ctx);
    if (/schema\.org/i.test(ctxStr)) earned += 10;
    else {
      enhancements.push('Use "@context": "https://schema.org"');
      earned += 4;
    }
  } else {
    // context may live on parent; soft warning
    enhancements.push('Ensure @context includes https://schema.org on the root object');
    earned += 5;
  }

  for (const type of types) {
    const rule = TYPE_RULES[type];
    if (!rule) {
      enhancements.push(`No built-in checklist for type "${type}" — verify required properties on schema.org`);
      possible += 5;
      earned += 3;
      continue;
    }
    if (rule.richResultHint) {
      enhancements.push(`${type}: ${rule.richResultHint}`);
    }
    for (const field of rule.required) {
      possible += 12;
      if (hasField(entity, field)) earned += 12;
      else issues.push(`${type} missing required "${field}"`);
    }
    for (const field of rule.recommended) {
      possible += 6;
      if (hasField(entity, field)) earned += 6;
      else enhancements.push(`${type}: add recommended "${field}"`);
    }
  }

  // Cross-check with HTML meta
  const nameLike = entity.name || entity.headline;
  if (typeof nameLike === 'string' && meta.title) {
    possible += 5;
    if (nameLike.trim() && meta.title.trim() && !meta.title.includes(nameLike.slice(0, 20)) && !nameLike.includes(meta.title.slice(0, 20))) {
      enhancements.push('JSON-LD name/headline differs from HTML <title> — align them when possible');
      earned += 2;
    } else earned += 5;
  }

  if (hasField(entity, 'url')) {
    possible += 5;
    const u = String(entity.url);
    try {
      const eu = new URL(u, pageUrl);
      const pu = new URL(pageUrl);
      if (eu.pathname === pu.pathname || u === meta.canonical) earned += 5;
      else {
        enhancements.push('url in JSON-LD should match the page canonical URL');
        earned += 2;
      }
    } catch {
      issues.push('url is not a valid URL');
    }
  }

  // Product offers nesting
  if (types.includes('Product') && hasField(entity, 'offers')) {
    const offers = entity.offers;
    const offerList = Array.isArray(offers) ? offers : [offers];
    for (const offer of offerList) {
      if (!offer || typeof offer !== 'object') continue;
      const o = /** @type {Record<string, unknown>} */ (offer);
      for (const f of ['price', 'priceCurrency', 'availability']) {
        possible += 4;
        if (hasField(o, f)) earned += 4;
        else issues.push(`Product offers missing "${f}"`);
      }
    }
  }

  // FAQ structure
  if (types.includes('FAQPage') && hasField(entity, 'mainEntity')) {
    const main = entity.mainEntity;
    const qs = Array.isArray(main) ? main : [main];
    possible += 8;
    if (qs.length === 0) issues.push('FAQPage mainEntity is empty');
    else {
      earned += 8;
      for (const q of qs) {
        if (!q || typeof q !== 'object') continue;
        const qq = /** @type {Record<string, unknown>} */ (q);
        if (!hasField(qq, 'name')) issues.push('FAQ Question missing name');
        if (!hasField(qq, 'acceptedAnswer')) issues.push('FAQ Question missing acceptedAnswer');
      }
    }
  }

  // BreadcrumbList
  if (types.includes('BreadcrumbList') && hasField(entity, 'itemListElement')) {
    possible += 8;
    const items = entity.itemListElement;
    if (!Array.isArray(items) || items.length === 0) issues.push('BreadcrumbList itemListElement should be a non-empty array');
    else earned += 8;
  }

  return { issues, enhancements, earned, possible };
}

/**
 * Analyze one page's extracted JSON-LD + meta.
 * @param {string} url
 * @param {ExtractedPage} extracted
 * @param {{ status?: number, fetchError?: string }} [fetchInfo]
 * @returns {Promise<PageAnalysis>}
 */
export async function analyzePage(url, extracted, fetchInfo = {}) {
  /** @type {PageAnalysis} */
  const base = {
    url,
    status: fetchInfo.status,
    fetchError: fetchInfo.fetchError,
    hasJsonLd: false,
    types: extracted.types || [],
    score: null,
    issues: [],
    enhancements: [],
    verdict: null,
    jsonLd: [],
    suggestion: null,
    suggestionScript: null,
    meta: extracted.meta,
    parseErrors: [],
  };

  if (fetchInfo.fetchError && !extracted.blocks?.length) {
    base.issues.push(`Fetch problem: ${fetchInfo.fetchError}`);
    return base;
  }

  const parseErrors = (extracted.blocks || [])
    .filter((b) => b.parseError)
    .map((b) => b.parseError);
  base.parseErrors = parseErrors;
  if (parseErrors.length) {
    base.issues.push(...parseErrors.map((e) => `Invalid JSON-LD: ${e}`));
  }

  const validBlocks = (extracted.blocks || []).filter((b) => b.data != null);
  base.hasJsonLd = validBlocks.length > 0 || parseErrors.length > 0;
  base.jsonLd = formatJsonLdBlocks(extracted.blocks || []);

  if (validBlocks.length === 0) {
    const suggestion = suggestForPage(url, extracted.meta);
    base.suggestion = suggestion.data;
    base.suggestionScript = suggestion.script;
    base.score = 0;
    base.issues.push('No valid JSON-LD found on this page');
    base.enhancements.push('Add the suggested JSON-LD snippet below as a starting point');
    return enhanceWithAI(base);
  }

  const entities = flattenEntities(validBlocks);
  if (entities.length === 0) {
    base.issues.push('JSON-LD parsed but no typed entities found');
    base.score = 20;
    const suggestion = suggestForPage(url, extracted.meta);
    base.suggestion = suggestion.data;
    base.suggestionScript = suggestion.script;
    return enhanceWithAI(base);
  }

  /** @type {string[]} */
  let issues = [];
  /** @type {string[]} */
  let enhancements = [];
  let earned = 0;
  let possible = 0;

  // Root @context check on blocks
  for (const block of validBlocks) {
    const data = block.data;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = /** @type {Record<string, unknown>} */ (data);
      if (!obj['@context'] && !obj['@graph']) {
        enhancements.push('Root JSON-LD object should include "@context": "https://schema.org"');
      }
    }
  }

  for (const entity of entities) {
    const result = checkEntity(entity, extracted.meta, url);
    issues.push(...result.issues);
    enhancements.push(...result.enhancements);
    earned += result.earned;
    possible += result.possible;
  }

  // Deduplicate and never keep overall copy in the enhancements list
  issues = [...new Set(issues)];
  enhancements = [...new Set(enhancements)].filter((e) => !/^overall\s*:/i.test(String(e)));

  // Flag suspiciously low wordCount values anywhere in the JSON-LD
  for (const block of validBlocks) {
    for (const count of findLowWordCounts(block.data)) {
      issues.push(
        `wordCount of ${count} looks too low — this doesn't look right; check it against the actual article word count (or remove wordCount if unsure)`
      );
    }
  }
  issues = [...new Set(issues)];

  const score = possible > 0 ? Math.max(0, Math.min(100, Math.round((earned / possible) * 100))) : 50;
  base.score = score;
  base.issues = issues;
  base.enhancements = enhancements;
  base.types = extracted.types;

  if (score < 70) {
    base.verdict = 'JSON-LD can be enhanced — address issues and recommended fields below.';
  } else if (issues.length === 0) {
    base.verdict = 'JSON-LD looks decent; optional polish listed below.';
  }

  return enhanceWithAI(base);
}

/**
 * Pretty-print extracted JSON-LD blocks for display.
 * @param {import('./extract.js').JsonLdBlock[]} blocks
 * @returns {string[]}
 */
function formatJsonLdBlocks(blocks) {
  /** @type {string[]} */
  const out = [];
  for (const block of blocks) {
    if (block.data != null) {
      try {
        out.push(JSON.stringify(block.data, null, 2));
        continue;
      } catch {
        /* fall through */
      }
    }
    if (block.raw && block.raw.trim()) out.push(block.raw.trim());
  }
  return out;
}

/**
 * Find wordCount values under 30 anywhere in a JSON-LD tree.
 * @param {unknown} node
 * @param {number[]} [found]
 * @returns {number[]}
 */
function findLowWordCounts(node, found = []) {
  if (node == null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) findLowWordCounts(item, found);
    return found;
  }
  /** @type {Record<string, unknown>} */
  const obj = /** @type {Record<string, unknown>} */ (node);
  if ('wordCount' in obj) {
    const n = Number(obj.wordCount);
    if (Number.isFinite(n) && n >= 0 && n < 30) found.push(n);
  }
  for (const value of Object.values(obj)) findLowWordCounts(value, found);
  return found;
}

/**
 * Build site-level summary from page analyses.
 * @param {PageAnalysis[]} pages
 */
export function summarizeSite(pages) {
  const crawled = pages.length;
  const withJsonLd = pages.filter((p) => p.hasJsonLd && (!p.parseErrors || p.parseErrors.length === 0 || p.types.length)).length;
  const withValid = pages.filter((p) => p.types && p.types.length > 0).length;
  const without = pages.filter((p) => !p.types || p.types.length === 0).length;

  /** @type {Record<string, number>} */
  const typeCounts = {};
  /** @type {Record<string, number>} */
  const issueCounts = {};

  for (const p of pages) {
    for (const t of p.types || []) typeCounts[t] = (typeCounts[t] || 0) + 1;
    for (const i of p.issues || []) issueCounts[i] = (issueCounts[i] || 0) + 1;
  }

  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));

  /** @type {string[]} */
  const quickWins = [];
  if (without > 0) quickWins.push(`Add JSON-LD to ${without} page(s) that have none (see per-page suggestions)`);
  if (topIssues[0]) quickWins.push(`Fix most common issue: ${topIssues[0].issue} (${topIssues[0].count}×)`);
  const lowScores = pages.filter((p) => p.score != null && p.score < 60);
  if (lowScores.length) quickWins.push(`Improve ${lowScores.length} page(s) scoring below 60`);

  const scored = pages.filter((p) => p.score != null);
  const avgScore =
    scored.length > 0 ? Math.round(scored.reduce((s, p) => s + /** @type {number} */ (p.score), 0) / scored.length) : null;

  return {
    crawled,
    withJsonLd: withValid,
    withoutJsonLd: without,
    avgScore,
    topTypes,
    topIssues,
    quickWins,
  };
}
