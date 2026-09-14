import { withTimeout, normalizeStartUrl } from './util.js';
import { extractFromHtml } from './extract.js';
import { analyzePage } from './analyze.js';
import { analyzeLlmsTxt } from './llms.js';
import { runGeneral } from './general.js';
import { runQuickscan, selectTechSamplePages } from './quickscan.js';
import { runContentQuickscan, selectImportantPages } from './content-quickscan.js';
import { generateAiJson, isAiConfigured, missingAiKeyError } from './ai.js';
import { detectChannels } from './channels.js';
import { runAiInsights } from './ai-insights.js';
import { runClientVerslag } from './client-verslag.js';

/**
 * Fetch a single HTML page.
 * @param {string} url
 * @param {number} [timeoutMs]
 */
async function fetchHtmlPage(url, timeoutMs = 10_000) {
  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'jsonld-analyze/1.0 (+recheck)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();
    const isHtml = /html|xhtml|xml/i.test(contentType) || !contentType;
    if (!res.ok) {
      return { url, status: res.status, html: '', error: `HTTP ${res.status}` };
    }
    if (!isHtml) {
      return { url, status: res.status, html: '', error: `Non-HTML content-type: ${contentType}` };
    }
    return { url: res.url || url, status: res.status, html: text, error: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { url, status: 0, html: '', error: message };
  } finally {
    clear();
  }
}

/**
 * Re-analyze one page URL for JSON-LD.
 * @param {string} pageUrl
 * @param {{ timeoutMs?: number }} [options]
 */
export async function recheckPage(pageUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const normalized = normalizeStartUrl(pageUrl).href;
  const fetched = await fetchHtmlPage(normalized, timeoutMs);
  const extracted = fetched.html
    ? extractFromHtml(fetched.html, fetched.url || normalized)
    : {
        meta: {
          title: '',
          description: '',
          canonical: normalized,
          ogTitle: '',
          ogDescription: '',
          ogImage: '',
          ogType: '',
          siteName: '',
        },
        blocks: [],
        types: [],
      };

  const page = await analyzePage(fetched.url || normalized, extracted, {
    status: fetched.status,
    fetchError: fetched.error,
  });
  return page;
}

/**
 * Re-analyze llms.txt for a site.
 * @param {string} startUrl
 * @param {{ timeoutMs?: number }} [options]
 */
export async function recheckLlms(startUrl, options = {}) {
  return analyzeLlmsTxt(startUrl, { timeoutMs: options.timeoutMs ?? 10_000 });
}

/**
 * Ask Gemini whether a previously reported quickscan item looks fixed on the live site.
 * @param {object} input
 * @param {string} input.siteUrl
 * @param {string} input.item
 * @param {'issues'|'wins'} [input.kind]
 * @param {number} [input.timeoutMs]
 * @param {string} [input.model]
 */
export async function confirmQuickscanItem(input) {
  if (!isAiConfigured()) {
    return {
      ok: false,
      fixed: false,
      note: null,
      error: missingAiKeyError('Quickscan checks'),
    };
  }

  const siteUrl = String(input.siteUrl || '').trim();
  const item = String(input.item || '').trim();
  if (!siteUrl || !item) {
    return { ok: false, fixed: false, note: null, error: 'siteUrl and item are required' };
  }

  const timeoutMs = input.timeoutMs ?? 12_000;
  const start = normalizeStartUrl(siteUrl);
  const fetched = await fetchHtmlPage(start.href, timeoutMs);
  const htmlExcerpt = String(fetched.html || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 14000);

  const kindLabel = input.kind === 'wins' ? 'improvement / nice-to-have' : 'issue / probleem';
  const prompt = `Je controleert of een eerder gemeld website-${kindLabel} is opgelost.

Het volgende was het probleem op ${start.href}:
"${item}"

Developers hebben dit nu als opgelost gemarkeerd. Kun je dit bevestigen op de live website?

Bekijk het live pagina-bewijs hieronder (zojuist opgehaald). Return ONLY valid JSON:
{
  "fixed": true or false,
  "note": "1-2 zinnen in het Nederlands die uitleggen waarom het opgelost lijkt of nog aanwezig is"
}

Rules:
- Prefer false when evidence is insufficient or ambiguous.
- Be concrete; reference what you see (or do not see) in the live HTML/content.
- The "note" must be written in Dutch.
- No markdown fences. JSON only.

Fetch status: ${fetched.error ? `error: ${fetched.error}` : `HTTP ${fetched.status}`}
Live page URL: ${fetched.url || start.href}
Live HTML excerpt:
${htmlExcerpt || '(unavailable)'}`;

  const result = await generateAiJson({ prompt, temperature: 0.2, model: input.model });
  if (!result.ok) {
    return { ok: false, fixed: false, note: null, error: result.error, model: result.model };
  }

  const parsed = result.parsed;
  return {
    ok: true,
    fixed: Boolean(parsed.fixed),
    note: typeof parsed.note === 'string' ? parsed.note.trim() : null,
    error: null,
    model: result.model,
  };
}

/**
 * Re-run the General company overview for a site URL.
 * Uses a fresh homepage fetch plus optional light crawl context from the client.
 * @param {string} startUrl
 * @param {{ timeoutMs?: number, pages?: object[], summary?: object, llms?: object, audience?: 'business'|'tech', model?: string }} [options]
 */
export async function recheckGeneral(startUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const start = normalizeStartUrl(startUrl);
  const fetched = await fetchHtmlPage(start.href, timeoutMs);

  /** @type {import('./analyze.js').PageAnalysis[]} */
  let pages = Array.isArray(options.pages) ? /** @type {any[]} */ (options.pages) : [];
  if (pages.length === 0 && fetched.html) {
    const extracted = extractFromHtml(fetched.html, fetched.url || start.href);
    const page = await analyzePage(fetched.url || start.href, extracted, {
      status: fetched.status,
      fetchError: fetched.error,
    });
    pages = [page];
  }

  return runGeneral({
    url: start.href,
    homepageHtml: fetched.html || '',
    pages,
    llms: options.llms,
    summary: options.summary,
    model: options.model,
  });
}

/**
 * Re-run Quickscan for a site URL.
 * Fetches homepage HTML plus up to 3 other representative pages for deeper evidence.
 * @param {string} startUrl
 * @param {{ timeoutMs?: number, pages?: object[], summary?: object, llms?: object, audience?: 'business'|'tech', model?: string }} [options]
 */
export async function recheckQuickscan(startUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const start = normalizeStartUrl(startUrl);
  const fetched = await fetchHtmlPage(start.href, timeoutMs);

  /** @type {import('./analyze.js').PageAnalysis[]} */
  let pages = Array.isArray(options.pages) ? /** @type {any[]} */ (options.pages) : [];
  if (pages.length === 0 && fetched.html) {
    const extracted = extractFromHtml(fetched.html, fetched.url || start.href);
    const page = await analyzePage(fetched.url || start.href, extracted, {
      status: fetched.status,
      fetchError: fetched.error,
    });
    pages = [page];
  }

  /** @type {Record<string, string>} */
  const pageHtmlByUrl = {};
  if (fetched.html) {
    pageHtmlByUrl[fetched.url || start.href] = fetched.html;
    pageHtmlByUrl[start.href] = fetched.html;
  }

  const sample = selectTechSamplePages(pages, start.href);
  const toFetch = sample
    .map((p) => p.url)
    .filter((url) => {
      try {
        const a = new URL(url);
        const b = new URL(fetched.url || start.href);
        return a.href !== b.href && a.pathname !== b.pathname;
      } catch {
        return url !== start.href;
      }
    })
    .slice(0, 3);

  await Promise.all(
    toFetch.map(async (url) => {
      const pageFetch = await fetchHtmlPage(url, timeoutMs);
      if (pageFetch.html) pageHtmlByUrl[url] = pageFetch.html;
    }),
  );

  return runQuickscan({
    url: start.href,
    homepageHtml: fetched.html || '',
    pageHtmlByUrl,
    pages,
    llms: options.llms,
    summary: options.summary,
    model: options.model,
  });
}

/**
 * Re-run Content Quickscan for a site URL.
 * Fetches HTML for prioritized pages (home / about / services when found).
 * @param {string} startUrl
 * @param {{ timeoutMs?: number, pages?: object[], summary?: object, audience?: 'business'|'tech', model?: string }} [options]
 */
export async function recheckContentQuickscan(startUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const start = normalizeStartUrl(startUrl);

  /** @type {import('./analyze.js').PageAnalysis[]} */
  let pages = Array.isArray(options.pages) ? /** @type {any[]} */ (options.pages) : [];
  const homeFetched = await fetchHtmlPage(start.href, timeoutMs);

  if (pages.length === 0 && homeFetched.html) {
    const extracted = extractFromHtml(homeFetched.html, homeFetched.url || start.href);
    const page = await analyzePage(homeFetched.url || start.href, extracted, {
      status: homeFetched.status,
      fetchError: homeFetched.error,
    });
    pages = [page];
  }

  const selected = selectImportantPages(pages, start.href, 6);
  /** @type {Record<string, string>} */
  const pageHtmlByUrl = {};
  if (homeFetched.html) {
    pageHtmlByUrl[homeFetched.url || start.href] = homeFetched.html;
    pageHtmlByUrl[start.href] = homeFetched.html;
  }

  const toFetch = selected
    .map((p) => p.url)
    .filter((url) => {
      try {
        const a = new URL(url);
        const b = new URL(homeFetched.url || start.href);
        return a.href !== b.href && a.pathname !== b.pathname;
      } catch {
        return url !== start.href;
      }
    })
    .slice(0, 5);

  await Promise.all(
    toFetch.map(async (url) => {
      const fetched = await fetchHtmlPage(url, timeoutMs);
      if (fetched.html) pageHtmlByUrl[url] = fetched.html;
    }),
  );

  return runContentQuickscan({
    url: start.href,
    homepageHtml: homeFetched.html || '',
    pageHtmlByUrl,
    pages,
    summary: options.summary,
    model: options.model,
  });
}

/**
 * Re-detect channels from a fresh fetch of home + high-signal pages.
 * @param {string} startUrl
 * @param {{ timeoutMs?: number, pages?: object[] }} [options]
 */
export async function recheckChannels(startUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 12_000;
  const start = normalizeStartUrl(startUrl);

  /** @type {import('./analyze.js').PageAnalysis[]} */
  let pages = Array.isArray(options.pages) ? /** @type {any[]} */ (options.pages) : [];
  const homeFetched = await fetchHtmlPage(start.href, timeoutMs);

  /** @type {Record<string, string>} */
  const htmlByUrl = {};
  /** @type {import('./analyze.js').PageAnalysis[]} */
  const analyses = [];

  if (homeFetched.html) {
    htmlByUrl[homeFetched.url || start.href] = homeFetched.html;
    htmlByUrl[start.href] = homeFetched.html;
    const extracted = extractFromHtml(homeFetched.html, homeFetched.url || start.href);
    const page = await analyzePage(homeFetched.url || start.href, extracted, {
      status: homeFetched.status,
      fetchError: homeFetched.error,
    });
    analyses.push(page);
  }

  if (pages.length === 0) pages = analyses;

  const selected = selectImportantPages(pages, start.href, 8);
  const toFetch = selected
    .map((p) => p.url)
    .filter((url) => {
      try {
        const a = new URL(url);
        const b = new URL(homeFetched.url || start.href);
        return a.href !== b.href && a.pathname !== b.pathname;
      } catch {
        return url !== start.href;
      }
    })
    .slice(0, 7);

  await Promise.all(
    toFetch.map(async (url) => {
      const fetched = await fetchHtmlPage(url, timeoutMs);
      if (!fetched.html) return;
      htmlByUrl[url] = fetched.html;
      const extracted = extractFromHtml(fetched.html, fetched.url || url);
      const page = await analyzePage(fetched.url || url, extracted, {
        status: fetched.status,
        fetchError: fetched.error,
      });
      analyses.push(page);
    }),
  );

  const mergedPages = analyses.length > 0 ? analyses : pages;
  return detectChannels({
    url: start.href,
    pages: mergedPages,
    htmlByUrl,
  });
}

/**
 * Generate AI insight cards for the Insights tab (Gemini).
 * @param {string} startUrl
 * @param {{ timeoutMs?: number, pages?: object[], summary?: object, llms?: object, general?: object, channels?: object, model?: string }} [options]
 */
export async function recheckAiInsights(startUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const start = normalizeStartUrl(startUrl);
  const fetched = await fetchHtmlPage(start.href, timeoutMs);

  /** @type {import('./analyze.js').PageAnalysis[]} */
  let pages = Array.isArray(options.pages) ? /** @type {any[]} */ (options.pages) : [];
  if (pages.length === 0 && fetched.html) {
    const extracted = extractFromHtml(fetched.html, fetched.url || start.href);
    const page = await analyzePage(fetched.url || start.href, extracted, {
      status: fetched.status,
      fetchError: fetched.error,
    });
    pages = [page];
  }

  return runAiInsights({
    url: start.href,
    homepageHtml: fetched.html || '',
    pages,
    llms: options.llms,
    summary: options.summary,
    general: options.general,
    channels: options.channels,
    model: options.model,
  });
}

/**
 * Generate client verslag from insights, intake, and consultant notes.
 * @param {string} startUrl
 * @param {{ general?: object, aiInsights?: object, notesHtml?: string, savedNotes?: object[], channels?: object, model?: string }} [options]
 */
export async function recheckClientVerslag(startUrl, options = {}) {
  const start = normalizeStartUrl(startUrl);
  return runClientVerslag({
    url: start.href,
    general: options.general ?? null,
    aiInsights: options.aiInsights ?? null,
    notesHtml: typeof options.notesHtml === 'string' ? options.notesHtml : '',
    savedNotes: Array.isArray(options.savedNotes) ? options.savedNotes : [],
    channels: options.channels ?? null,
    model: options.model,
  });
}
