/**
 * AI-powered content quickscan (messaging, clarity, CTAs, conversion focus).
 * Prefers home / about / services pages when present, then other important pages.
 * Same dual business/tech issue+improvement shape as the tech Quickscan.
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
 * }} ContentQuickscanItem
 *
 * @typedef {object} ContentQuickscanResult
 * @property {boolean} ok
 * @property {DualText|null} summary
 * @property {ContentQuickscanItem[]} issues
 * @property {ContentQuickscanItem[]} quickWins
 * @property {string[]} [focusPages]
 * @property {string|null} [error]
 * @property {string} [model]
 */

/**
 * @param {object} input
 * @param {string} input.url
 * @param {string} [input.homepageHtml]
 * @param {Record<string, string>} [input.pageHtmlByUrl]
 * @param {import('./analyze.js').PageAnalysis[]} [input.pages]
 * @param {object} [input.summary]
 * @returns {Promise<ContentQuickscanResult>}
 */
export async function runContentQuickscan(input) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      summary: null,
      issues: [],
      quickWins: [],
      focusPages: [],
      error: missingAiKeyError('Content Quickscan'),
    };
  }

  const selected = selectImportantPages(input.pages || [], input.url);
  const context = buildContentContext(input, selected);
  const prompt = loadPrompt('content-quickscan', { context });

  const result = await generateAiJson({
    prompt,
    temperature: 0.25,
    maxOutputTokens: 8192,
  });
  if (!result.ok) {
    return {
      ok: false,
      summary: null,
      issues: [],
      quickWins: [],
      focusPages: selected.map((p) => p.url),
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
    focusPages: selected.map((p) => p.url),
    error: null,
    model: result.model,
  };
}

/**
 * Rank crawl pages, preferring home / about / services (+ other useful pages).
 * @param {import('./analyze.js').PageAnalysis[]} pages
 * @param {string} startUrl
 * @param {number} [limit]
 */
export function selectImportantPages(pages, startUrl, limit = 8) {
  /** @type {{ url: string, title: string, description: string, role: string, score: number }[]} */
  const scored = [];
  let homeOrigin = '';
  try {
    homeOrigin = new URL(startUrl.includes('://') ? startUrl : `https://${startUrl}`).origin;
  } catch {
    homeOrigin = '';
  }

  for (const page of pages || []) {
    const url = String(page?.url || '').trim();
    if (!url) continue;
    const title = String(page?.meta?.title || '').trim();
    const description = String(page?.meta?.description || '').trim();
    const role = classifyPageRole(url, title, homeOrigin);
    let score = roleScore(role);
    if (title) score += 1;
    if (description) score += 1;
    scored.push({ url, title, description, role, score });
  }

  scored.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  /** @type {typeof scored} */
  const picked = [];
  const seen = new Set();
  for (const role of ['home', 'about', 'services', 'contact', 'other']) {
    for (const item of scored) {
      if (item.role !== role || seen.has(item.url)) continue;
      picked.push(item);
      seen.add(item.url);
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}

/**
 * @param {string} url
 * @param {string} title
 * @param {string} homeOrigin
 */
function classifyPageRole(url, title, homeOrigin) {
  let path = url.toLowerCase();
  try {
    const u = new URL(url);
    path = `${u.pathname}${u.search}`.toLowerCase();
    if (homeOrigin && u.origin === homeOrigin && (u.pathname === '/' || u.pathname === '')) {
      return 'home';
    }
  } catch {
    /* keep path */
  }
  const blob = `${path} ${title.toLowerCase()}`;
  if (/(^|\/)(home|index)(\/|$|\.)/.test(path) || /\bhome\b/.test(title.toLowerCase())) return 'home';
  if (/about|over[-_/ ]?ons|wie[-_/ ]?wij|company|team|missie|visie/.test(blob)) return 'about';
  if (/service|dienst|aanbod|oplossing|solution|product|expertise|werkzaam/.test(blob)) return 'services';
  if (/contact|offerte|quote|demo|afspraak|aanvraag/.test(blob)) return 'contact';
  return 'other';
}

/**
 * @param {string} role
 */
function roleScore(role) {
  if (role === 'home') return 100;
  if (role === 'about') return 80;
  if (role === 'services') return 75;
  if (role === 'contact') return 55;
  return 20;
}

/**
 * @param {object} input
 * @param {{ url: string, title: string, description: string, role: string }[]} selected
 */
function buildContentContext(input, selected) {
  const htmlByUrl = /** @type {Record<string, string>} */ (input.pageHtmlByUrl || {});
  const homeHtml = String(input.homepageHtml || '');
  const pageBlocks = selected.map((page, index) => {
    const html =
      htmlByUrl[page.url] ||
      (index === 0 || page.role === 'home' ? homeHtml : '');
    const excerpt = html ? extractContentExcerpt(html) : '(geen HTML-excerpt beschikbaar — alleen meta)';
    const quotes = html ? extractQuoteBlocks(html) : '(geen quotes)';
    return [
      `### ${page.role.toUpperCase()} — ${page.url}`,
      `Title: ${page.title || '(none)'}`,
      `Meta description: ${page.description || '(none)'}`,
      `Citeerbare quotes / CTA's / openingscopy:\n${quotes}`,
      `Content excerpt:\n${excerpt}`,
    ].join('\n');
  });

  const otherPages = (input.pages || [])
    .map((p) => `- ${p.url} | title=${p?.meta?.title || ''}`)
    .slice(0, 30)
    .join('\n');

  return [
    `Site URL: ${input.url}`,
    `Crawl summary: ${JSON.stringify(input.summary || {})}`,
    `Focus pages (prioritized home/about/services when found):\n${selected.map((p) => `- [${p.role}] ${p.url}`).join('\n') || '(none)'}`,
    `All crawled pages (for context):\n${otherPages || '(none)'}`,
    `Focus page content:\n\n${pageBlocks.join('\n\n') || '(unavailable)'}`,
  ].join('\n\n');
}

/**
 * Labeled quote blocks the model can cite literally.
 * @param {string} html
 */
function extractQuoteBlocks(html) {
  try {
    const $ = cheerio.load(html || '');
    $('script, style, noscript, svg, iframe').remove();
    /** @type {string[]} */
    const headings = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) headings.push(`HEADING(${el.tagName}): "${text}"`);
    });
    /** @type {string[]} */
    const ctas = [];
    $('a, button').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      const href = String($(el).attr('href') || '').trim();
      if (!text || text.length > 90) return;
      if (/contact|demo|start|offerte|aanvraag|gratis|probeer|plan|bel|mail|buy|shop|inschrijf|aanmeld|meer info|ontdek|bekijk/i.test(text)) {
        ctas.push(`CTA: "${text}"${href ? ` → ${href}` : ''}`);
      }
    });
    /** @type {string[]} */
    const paras = [];
    $('p').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text && text.length > 50) paras.push(`PARA: "${text.slice(0, 280)}${text.length > 280 ? '…' : ''}"`);
    });
    return [
      ...headings.slice(0, 12),
      ...ctas.slice(0, 15),
      ...paras.slice(0, 8),
    ].join('\n') || '(leeg)';
  } catch {
    return '(parse failed)';
  }
}

/**
 * Pull readable copy signals from HTML for the content prompt.
 * @param {string} html
 */
function extractContentExcerpt(html) {
  try {
    const $ = cheerio.load(html || '');
    $('script, style, noscript, svg, iframe').remove();
    const bits = [];
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) bits.push(`# ${text}`);
    });
    $('a').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      const href = String($(el).attr('href') || '').trim();
      if (text && text.length <= 80 && /contact|demo|start|offerte|aanvraag|gratis|probeer|plan|bel|mail|buy|shop|inschrijf|aanmeld/i.test(text)) {
        bits.push(`CTA: "${text}"${href ? ` → ${href}` : ''}`);
      }
    });
    $('p, li, button').each((_, el) => {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text && text.length > 40) bits.push(text);
    });
    const unique = [...new Set(bits)];
    return unique.join('\n').slice(0, 12000) || '(leeg)';
  } catch {
    return String(html || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 12000);
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
 * @returns {ContentQuickscanItem|null}
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
  /** @type {ContentQuickscanItem} */
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
 * @returns {ContentQuickscanItem[]}
 */
function toItemList(value, max, guideKey) {
  if (!Array.isArray(value)) return [];
  /** @type {ContentQuickscanItem[]} */
  const out = [];
  for (const item of value) {
    const normalized = toScanItem(item, guideKey);
    if (normalized) out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}
