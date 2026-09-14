import { crawlSite } from './crawl.js';
import { extractFromHtml } from './extract.js';
import { analyzePage, summarizeSite } from './analyze.js';
import { analyzeLlmsTxt, hintsFromPages, suggestLlmsTxt } from './llms.js';
import { normalizeStartUrl } from './util.js';
import { runQuickscan } from './quickscan.js';
import { runContentQuickscan } from './content-quickscan.js';
import { runGeneral } from './general.js';
import { detectChannels } from './channels.js';
import { computeSiteSignals } from './site-signals.js';

/**
 * @typedef {import('./crawl.js').CrawlOptions} CrawlOptions
 */

/**
 * Analyze an entire site for JSON-LD quality, llms.txt, Gemini quickscans, and general overview.
 * @param {string} url
 * @param {CrawlOptions & { skipQuickscan?: boolean, skipContentQuickscan?: boolean, skipGeneral?: boolean, audience?: 'business'|'tech', model?: string }} [options]
 */
export async function analyzeSite(url, options = {}) {
  const onProgress = options.onProgress || (() => {});
  const audience = options.audience === 'tech' ? 'tech' : 'business';
  const model = typeof options.model === 'string' && options.model.trim() ? options.model.trim() : undefined;

  onProgress('Checking llms.txt…');
  const llmsPromise = analyzeLlmsTxt(url, { timeoutMs: options.timeoutMs });

  const pages = await crawlSite(url, options);
  const crawledPages = pages.pages;
  const discovery = pages.discovery;
  /** @type {import('./analyze.js').PageAnalysis[]} */
  const analyses = [];
  /** @type {Map<string, string>} */
  const htmlByUrl = new Map();

  for (const page of crawledPages) {
    if (page.html) htmlByUrl.set(page.url, page.html);
    const extracted = page.html
      ? extractFromHtml(page.html, page.url)
      : {
          meta: {
            title: '',
            description: '',
            canonical: page.url,
            ogTitle: '',
            ogDescription: '',
            ogImage: '',
            ogType: '',
            siteName: '',
          },
          blocks: [],
          types: [],
        };

    const analysis = await analyzePage(page.url, extracted, {
      status: page.status,
      fetchError: page.error,
    });
    analyses.push(analysis);
  }

  const summary = summarizeSite(analyses);

  onProgress('Detecting channels…');
  const channels = detectChannels({
    url,
    pages: analyses,
    htmlByUrl,
  });

  /** @type {import('./llms.js').LlmsAnalysis} */
  let llms;
  try {
    llms = await llmsPromise;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const start = normalizeStartUrl(url);
    llms = {
      url: new URL('/llms.txt', start.origin).href,
      found: false,
      status: null,
      contentType: null,
      content: null,
      score: 0,
      issues: [`Could not analyze llms.txt: ${message}`],
      enhancements: ['Publish a curated /llms.txt so AI agents can discover your key pages'],
      verdict: null,
      suggestion: suggestLlmsTxt(start, hintsFromPages(start, analyses)),
    };
  }

  if (!llms.found) {
    try {
      const start = normalizeStartUrl(url);
      llms.suggestion = suggestLlmsTxt(start, hintsFromPages(start, analyses));
    } catch {
      try {
        llms.suggestion = suggestLlmsTxt(normalizeStartUrl(url), {});
      } catch {
        /* leave existing suggestion */
      }
    }
  }

  const homeHtml =
    htmlByUrl.get(analyses[0]?.url) ||
    [...htmlByUrl.values()][0] ||
    '';
  const geminiInput = {
    url,
    homepageHtml: homeHtml,
    pages: analyses,
    llms,
    summary,
  };

  /** @type {import('./quickscan.js').QuickscanResult|null} */
  let quickscan = null;
  /** @type {import('./content-quickscan.js').ContentQuickscanResult|null} */
  let contentQuickscan = null;
  /** @type {import('./general.js').GeneralResult|null} */
  let general = null;

  const runQs = options.skipQuickscan
    ? null
    : runQuickscan({
        ...geminiInput,
        model,
        pageHtmlByUrl: Object.fromEntries(htmlByUrl),
      });
  const runContentQs = options.skipContentQuickscan
    ? null
    : runContentQuickscan({
        ...geminiInput,
        model,
        pageHtmlByUrl: Object.fromEntries(htmlByUrl),
      });
  const runGen = options.skipGeneral ? null : runGeneral(geminiInput);
  if (runQs || runContentQs || runGen) {
    onProgress(
      runQs || runContentQs
        ? 'Running Gemini overview sections…'
        : 'Generating general company overview…',
    );
    const [qsResult, contentQsResult, genResult] = await Promise.all([
      runQs || Promise.resolve(null),
      runContentQs || Promise.resolve(null),
      runGen || Promise.resolve(null),
    ]);
    quickscan = qsResult;
    contentQuickscan = contentQsResult;
    general = genResult;
  }

  const signals = computeSiteSignals({
    pages: analyses,
    summary,
    llms,
    homepageHtml: homeHtml,
    discovery,
  });

  return {
    startUrl: url,
    analyzedAt: new Date().toISOString(),
    audience,
    aiModel: model || null,
    summary,
    signals,
    pages: analyses,
    llms,
    quickscan,
    contentQuickscan,
    channels,
    general,
  };
}

export { crawlSite } from './crawl.js';
export { extractFromHtml } from './extract.js';
export { analyzePage, summarizeSite } from './analyze.js';
export { suggestForPage } from './suggest.js';
export { analyzeLlmsTxt } from './llms.js';
export { runQuickscan } from './quickscan.js';
export { runContentQuickscan } from './content-quickscan.js';
export { runGeneral } from './general.js';
export { detectChannels, runChannels } from './channels.js';
