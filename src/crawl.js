import * as cheerio from 'cheerio';
import {
  isAllowedByRobots,
  looksLikeHtmlPath,
  normalizeStartUrl,
  resolveSameHostUrl,
  withTimeout,
} from './util.js';

/**
 * @typedef {object} CrawlOptions
 * @property {number} [maxPages]
 * @property {number} [concurrency]
 * @property {number} [timeoutMs]
 * @property {boolean} [respectRobots]
 * @property {(msg: string) => void} [onProgress]
 */

/**
 * @typedef {object} CrawledPage
 * @property {string} url
 * @property {number} status
 * @property {string} html
 * @property {string} [error]
 */

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<{ ok: boolean, status: number, text: string, contentType: string }>}
 */
async function fetchText(url, timeoutMs) {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'jsonld-analyze/1.0 (+https://github.com/local/jsonld-analyze)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, contentType };
  } finally {
    clear();
  }
}

/**
 * @param {URL} start
 * @param {string} robotsText
 * @param {number} timeoutMs
 * @returns {Promise<string[]>}
 */
async function discoverFromSitemap(start, robotsText, timeoutMs) {
  /** @type {Set<string>} */
  const candidates = new Set();
  const sitemapMatches = [...robotsText.matchAll(/Sitemap:\s*(\S+)/gi)].map((m) => m[1]);
  if (sitemapMatches.length === 0) {
    candidates.add(new URL('/sitemap.xml', start.origin).href);
    candidates.add(new URL('/sitemap_index.xml', start.origin).href);
  } else {
    for (const s of sitemapMatches) candidates.add(s);
  }

  /** @type {Set<string>} */
  const pageUrls = new Set();
  /** @type {Set<string>} */
  const visitedSitemaps = new Set();
  const queue = [...candidates];

  while (queue.length && pageUrls.size < 500) {
    const smUrl = queue.shift();
    if (!smUrl || visitedSitemaps.has(smUrl)) continue;
    visitedSitemaps.add(smUrl);
    try {
      const res = await fetchText(smUrl, timeoutMs);
      if (!res.ok) continue;
      const locs = [...res.text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
      for (const loc of locs) {
        if (/sitemap/i.test(loc) && /\.xml(\?|$)/i.test(loc)) {
          queue.push(loc);
          continue;
        }
        try {
          const u = new URL(loc);
          if (u.origin === start.origin || u.hostname.replace(/^www\./i, '') === start.hostname.replace(/^www\./i, '')) {
            if (looksLikeHtmlPath(u.href)) pageUrls.add(u.href.split('#')[0]);
          }
        } catch {
          /* skip */
        }
      }
    } catch {
      /* skip broken sitemap */
    }
  }
  return [...pageUrls];
}

/**
 * Extract same-host links from HTML.
 * @param {string} html
 * @param {URL} pageUrl
 * @param {URL} start
 */
export function extractLinks(html, pageUrl, start) {
  const $ = cheerio.load(html);
  /** @type {string[]} */
  const links = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    const resolved = resolveSameHostUrl(href, pageUrl, start);
    if (resolved && looksLikeHtmlPath(resolved.href)) links.push(resolved.href);
  });
  return [...new Set(links)];
}

/**
 * Bounded site crawl: sitemap first, then BFS fill.
 * @param {string} startInput
 * @param {CrawlOptions} [options]
 * @returns {Promise<CrawledPage[]>}
 */
export async function crawlSite(startInput, options = {}) {
  const maxPages = options.maxPages ?? 50;
  const concurrency = options.concurrency ?? 5;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const respectRobots = options.respectRobots !== false;
  const onProgress = options.onProgress || (() => {});

  const start = normalizeStartUrl(startInput);
  /** @type {string} */
  let robotsText = '';
  if (respectRobots) {
    try {
      const robotsUrl = new URL('/robots.txt', start.origin).href;
      const res = await fetchText(robotsUrl, timeoutMs);
      if (res.ok) robotsText = res.text;
    } catch {
      /* soft-fail */
    }
  }

  const allowed = (urlStr) => {
    if (!respectRobots || !robotsText) return true;
    try {
      return isAllowedByRobots(robotsText, new URL(urlStr).pathname);
    } catch {
      return true;
    }
  };

  onProgress('Discovering URLs from sitemap…');
  let discovered = [];
  try {
    discovered = await discoverFromSitemap(start, robotsText, timeoutMs);
  } catch {
    discovered = [];
  }

  /** @type {string[]} */
  const queue = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {CrawledPage[]} */
  const pages = [];

  const enqueue = (urlStr) => {
    const clean = urlStr.split('#')[0];
    if (seen.has(clean)) return;
    if (!looksLikeHtmlPath(clean)) return;
    if (!allowed(clean)) return;
    seen.add(clean);
    queue.push(clean);
  };

  enqueue(start.href);
  for (const u of discovered) enqueue(u);

  onProgress(`Queued ${queue.length} URL(s); fetching up to ${maxPages}…`);

  /**
   * @param {string} url
   */
  async function fetchPage(url) {
    try {
      const res = await fetchText(url, timeoutMs);
      const isHtml = /html|xhtml|xml/i.test(res.contentType) || !res.contentType;
      if (!res.ok) {
        return { url, status: res.status, html: '', error: `HTTP ${res.status}` };
      }
      if (!isHtml) {
        return { url, status: res.status, html: '', error: `Non-HTML content-type: ${res.contentType}` };
      }
      return { url, status: res.status, html: res.text };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { url, status: 0, html: '', error: message };
    }
  }

  let nextIndex = 0;
  let reserved = 0;
  let inFlight = 0;

  async function worker() {
    while (true) {
      if (reserved >= maxPages) return;

      if (nextIndex >= queue.length) {
        if (inFlight === 0) return;
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }

      if (reserved >= maxPages) return;
      const url = queue[nextIndex++];
      reserved += 1;
      inFlight += 1;
      onProgress(`Fetching (${reserved}/${maxPages}): ${url}`);

      try {
        const page = await fetchPage(url);
        pages.push(page);
        if (page.html) {
          const links = extractLinks(page.html, new URL(url), start);
          for (const link of links) {
            if (queue.length >= maxPages * 4) break;
            enqueue(link);
          }
        }
      } finally {
        inFlight -= 1;
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, maxPages) }, () => worker());
  await Promise.all(workers);

  return pages.slice(0, maxPages);
}
