/**
 * Compact site health signals for the Meta tab + printable verslag.
 */

/**
 * @typedef {object} SiteSignals
 * @property {number|null} metaScore
 * @property {number|null} jsonLdScore
 * @property {boolean} sitemap
 * @property {boolean} tracking
 * @property {boolean} robots
 * @property {boolean} llms
 */

const TRACKING_RE =
  /google-analytics\.com|googletagmanager\.com|gtag\s*\(|ga\s*\(\s*['"]create|GTM-[A-Z0-9]+|facebook\.net\/(?:en_US\/)?fbevents|fbq\s*\(|hotjar\.com|clarity\.ms|segment\.(?:com|io)|mixpanel\.com|matomo\.|plausible\.io|_paq\s*\.|linkedin\.com\/px|ads-twitter\.com|static\.ads-twitter|tiktok\.com\/i18n\/pixel|snap\.licdn\.com|cdn\.amplitude\.com/i;

/**
 * @param {string} [html]
 * @returns {boolean}
 */
export function detectTracking(html) {
  return TRACKING_RE.test(String(html || ''));
}

/**
 * Score HTML meta completeness for one page (0–100).
 * @param {import('./extract.js').PageMeta|null|undefined} meta
 * @returns {number|null}
 */
export function scorePageMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  let earned = 0;
  let possible = 0;

  const check = (value, weight) => {
    possible += weight;
    if (String(value || '').trim()) earned += weight;
  };

  check(meta.title, 28);
  check(meta.description, 28);
  check(meta.canonical, 12);
  check(meta.ogTitle || meta.title, 12);
  check(meta.ogDescription || meta.description, 10);
  check(meta.ogImage, 10);

  if (!possible) return null;
  return Math.round((earned / possible) * 100);
}

/**
 * @param {object} input
 * @param {import('./analyze.js').PageAnalysis[]} [input.pages]
 * @param {object} [input.summary]
 * @param {object} [input.llms]
 * @param {string} [input.homepageHtml]
 * @param {{ robotsFound?: boolean, sitemapFound?: boolean }} [input.discovery]
 * @returns {SiteSignals}
 */
export function computeSiteSignals(input = {}) {
  const pages = Array.isArray(input.pages) ? input.pages : [];
  const metaScores = pages
    .map((p) => scorePageMeta(p?.meta))
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
  const metaScore =
    metaScores.length > 0
      ? Math.round(metaScores.reduce((sum, n) => sum + n, 0) / metaScores.length)
      : null;

  const summaryScore = input.summary?.avgScore;
  const jsonLdScore =
    typeof summaryScore === 'number' && Number.isFinite(summaryScore)
      ? Math.round(summaryScore)
      : (() => {
          const scored = pages.filter((p) => typeof p?.score === 'number' && Number.isFinite(p.score));
          if (!scored.length) return null;
          return Math.round(scored.reduce((sum, p) => sum + /** @type {number} */ (p.score), 0) / scored.length);
        })();

  return {
    metaScore,
    jsonLdScore,
    sitemap: Boolean(input.discovery?.sitemapFound),
    tracking: detectTracking(input.homepageHtml),
    robots: Boolean(input.discovery?.robotsFound),
    llms: Boolean(input.llms?.found),
  };
}

/**
 * @param {unknown} value
 * @returns {SiteSignals}
 */
export function normalizeSiteSignals(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      metaScore: null,
      jsonLdScore: null,
      sitemap: false,
      tracking: false,
      robots: false,
      llms: false,
    };
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const toScore = (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
  };
  return {
    metaScore: toScore(obj.metaScore),
    jsonLdScore: toScore(obj.jsonLdScore),
    sitemap: Boolean(obj.sitemap),
    tracking: Boolean(obj.tracking),
    robots: Boolean(obj.robots),
    llms: Boolean(obj.llms),
  };
}
