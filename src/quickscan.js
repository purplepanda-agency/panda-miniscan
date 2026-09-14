/**
 * AI-powered quick scan for build & performance tips.
 * Each finding is returned in both Business developer and Tech expert wording.
 */

import * as cheerio from 'cheerio';
import { generateAiJson, isAiConfigured, missingAiKeyError } from './ai.js';
import { loadPrompt } from './prompts/load.js';

/**
 * @typedef {{ business: string, tech: string }} DualText
 * @typedef {DualText & {
 *   evidence?: DualText|null,
 *   suggestion?: DualText|null,
 *   pages?: string[],
 *   status?: 'open'|'fixed'|'open_still',
 *   note?: string|null,
 *   checkedAt?: string|null
 * }} QuickscanItem
 *
 * @typedef {object} QuickscanResult
 * @property {boolean} ok
 * @property {DualText|null} summary
 * @property {QuickscanItem[]} issues
 * @property {QuickscanItem[]} quickWins
 * @property {string|null} [error]
 * @property {string} [model]
 */

/**
 * @param {object} input
 * @param {string} input.url
 * @param {string} [input.homepageHtml]
 * @param {Record<string, string>} [input.pageHtmlByUrl]
 * @param {import('./analyze.js').PageAnalysis[]} [input.pages]
 * @param {import('./llms.js').LlmsAnalysis} [input.llms]
 * @param {object} [input.summary]
 * @returns {Promise<QuickscanResult>}
 */
export async function runQuickscan(input) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      summary: null,
      issues: [],
      quickWins: [],
      error: missingAiKeyError('Quickscan'),
    };
  }

  const context = buildContext(input);
  const prompt = loadPrompt('tech-quickscan', { context });

  const result = await generateAiJson({
    prompt,
    temperature: 0.22,
    maxOutputTokens: 8192,
    model: input.model,
  });
  if (!result.ok) {
    return {
      ok: false,
      summary: null,
      issues: [],
      quickWins: [],
      error: result.error,
      model: result.model,
    };
  }

  const parsed = result.parsed;
  const improvementSource = Array.isArray(parsed.improvements)
    ? parsed.improvements
    : parsed.quickWins;

  return {
    ok: true,
    summary: toDual(parsed.summary),
    issues: toItemList(parsed.issues, 7, 'suggestion'),
    quickWins: toItemList(improvementSource, 7, 'guide'),
    error: null,
    model: result.model,
  };
}

/**
 * Pick homepage + up to 3 other representative pages for HTML excerpts.
 * @param {import('./analyze.js').PageAnalysis[]} pages
 * @param {string} startUrl
 */
export function selectTechSamplePages(pages, startUrl) {
  const list = Array.isArray(pages) ? pages.filter((p) => p?.url) : [];
  if (!list.length) return [];

  /** @type {import('./analyze.js').PageAnalysis[]} */
  const picked = [];
  const seen = new Set();

  const push = (page) => {
    if (!page?.url || seen.has(page.url) || picked.length >= 4) return;
    seen.add(page.url);
    picked.push(page);
  };

  let home = list[0];
  try {
    const origin = new URL(startUrl.includes('://') ? startUrl : `https://${startUrl}`).origin;
    home = list.find((p) => {
      try {
        const u = new URL(p.url);
        return u.origin === origin && (u.pathname === '/' || u.pathname === '');
      } catch {
        return false;
      }
    }) || list[0];
  } catch {
    /* keep first */
  }
  push(home);

  const scored = [...list]
    .filter((p) => !seen.has(p.url))
    .map((p) => {
      const issueN = Array.isArray(p.issues) ? p.issues.length : 0;
      const score = p.score == null ? 50 : Number(p.score);
      return { page: p, rank: issueN * 10 + (score < 60 ? 8 : 0) + (p.types?.length ? 0 : 5) };
    })
    .sort((a, b) => b.rank - a.rank);

  for (const row of scored) push(row.page);
  return picked;
}

/**
 * @param {object} input
 */
function buildContext(input) {
  const pages = input.pages || [];
  const htmlByUrl = /** @type {Record<string, string>} */ (input.pageHtmlByUrl || {});
  const homeHtml = String(input.homepageHtml || '');
  const samplePages = selectTechSamplePages(pages, input.url);

  const pageLines = pages.slice(0, 25).map((p) => {
    const types = (p.types || []).join(', ') || 'none';
    const issues = (p.issues || []).slice(0, 4).join('; ') || 'none';
    const enhancements = (p.enhancements || []).slice(0, 3).join('; ') || 'none';
    return `- ${p.url} | score=${p.score ?? 'n/a'} | jsonld=${types} | title=${p.meta?.title || ''} | issues=${issues} | enhancements=${enhancements}`;
  });

  const htmlBlocks = samplePages.map((page, index) => {
    const html =
      htmlByUrl[page.url] ||
      (index === 0 ? homeHtml : '');
    const limit = index === 0 ? 20000 : 10000;
    const collapsed = String(html || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
    const signals = html ? structuralSignals(html) : '(geen HTML)';
    return [
      `### PAGE ${page.url}`,
      `Title: ${page.meta?.title || '(none)'}`,
      `Description: ${page.meta?.description || '(none)'}`,
      `JSON-LD types: ${(page.types || []).join(', ') || 'none'}`,
      `Crawl issues: ${(page.issues || []).join(' | ') || 'none'}`,
      `Crawl enhancements: ${(page.enhancements || []).join(' | ') || 'none'}`,
      `Structural signals: ${signals}`,
      `HTML excerpt:\n${collapsed || '(unavailable)'}`,
    ].join('\n');
  });

  const home = samplePages[0] || pages[0];

  return [
    `URL: ${input.url}`,
    `Crawl summary: ${JSON.stringify(input.summary || {})}`,
    `llms.txt: ${input.llms?.found ? `found score=${input.llms.score}` : 'missing'}`,
    `Home title: ${home?.meta?.title || ''}`,
    `Home description: ${home?.meta?.description || ''}`,
    `All crawled pages (signals):\n${pageLines.join('\n') || '(none)'}`,
    `Deep HTML samples (home + up to 3 others):\n\n${htmlBlocks.join('\n\n') || '(unavailable)'}`,
  ].join('\n\n');
}

/**
 * @param {string} html
 */
function structuralSignals(html) {
  try {
    const $ = cheerio.load(html || '');
    const scripts = $('script[src]').length;
    const inlineScripts = $('script:not([src])').length;
    const imgs = $('img').length;
    const imgsNoAlt = $('img:not([alt]), img[alt=""]').length;
    const h1 = $('h1').length;
    const canonical = $('link[rel="canonical"]').attr('href') || '';
    const viewport = $('meta[name="viewport"]').attr('content') || '';
    const jsonLd = $('script[type="application/ld+json"]').length;
    return [
      `script[src]=${scripts}`,
      `inlineScript=${inlineScripts}`,
      `img=${imgs}`,
      `imgMissingAlt=${imgsNoAlt}`,
      `h1=${h1}`,
      `jsonLdBlocks=${jsonLd}`,
      `canonical=${canonical || 'none'}`,
      `viewport=${viewport ? 'present' : 'missing'}`,
    ].join(', ');
  } catch {
    return '(parse failed)';
  }
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
  if (Array.isArray(value)) {
    const lines = value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim();
        if (entry && typeof entry === 'object') {
          const obj = /** @type {Record<string, unknown>} */ (entry);
          return String(obj.text || obj.quote || obj.detail || obj.business || obj.tech || '').trim();
        }
        return '';
      })
      .filter(Boolean);
    if (!lines.length) return null;
    const joined = lines.map((line, i) => `${i + 1}) ${line}`).join('\n');
    return { business: joined, tech: joined };
  }
  if (typeof value === 'object') {
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
 * @returns {string[]}
 */
function toPages(value) {
  if (!Array.isArray(value)) return [];
  /** @type {string[]} */
  const out = [];
  for (const entry of value) {
    const url = String(entry || '').trim();
    if (!url) continue;
    out.push(url);
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {'suggestion'|'guide'} guideKey
 * @returns {QuickscanItem|null}
 */
function toScanItem(value, guideKey) {
  const dual = toDual(value);
  if (!dual) return null;
  /** @type {DualText|null} */
  let suggestion = null;
  /** @type {DualText|null} */
  let evidence = null;
  /** @type {string[]} */
  let pages = [];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = /** @type {Record<string, unknown>} */ (value);
    suggestion =
      toDual(obj[guideKey]) ||
      toDual(obj.suggestion) ||
      toDual(obj.guide) ||
      toDual(obj.fixSuggestion) ||
      toDual(obj.howToFix) ||
      toDual(obj.fix);
    evidence =
      toDual(obj.evidence) ||
      toDual(obj.examples) ||
      toDual(obj.proof) ||
      toDual(obj.observations);
    pages = toPages(obj.pages || obj.urls || obj.affectedPages);
  }
  /** @type {QuickscanItem} */
  const item = { ...dual };
  if (suggestion) item.suggestion = suggestion;
  if (evidence) item.evidence = evidence;
  if (pages.length) item.pages = pages;
  return item;
}

/**
 * @param {unknown} value
 * @param {number} max
 * @param {'suggestion'|'guide'} guideKey
 * @returns {QuickscanItem[]}
 */
function toItemList(value, max, guideKey) {
  if (!Array.isArray(value)) return [];
  /** @type {QuickscanItem[]} */
  const out = [];
  for (const item of value) {
    const normalized = toScanItem(item, guideKey);
    if (normalized) out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}
