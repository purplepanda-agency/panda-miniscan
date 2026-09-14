import * as cheerio from 'cheerio';
import { flattenEntities, extractFromHtml } from './extract.js';
import { normalizeStartUrl, sameOriginHost } from './util.js';

/**
 * @typedef {'social'|'video'|'messaging'|'google_business'|'shop'|'website'|'other'|'individual_social'} ChannelCategory
 * @typedef {'link'|'sameAs'|'meta'|'signal'} ChannelSourceType
 * @typedef {'company'|'individual'} ChannelAccountType
 *
 * @typedef {object} ChannelSource
 * @property {ChannelSourceType} type
 * @property {string} pageUrl
 *
 * @typedef {object} ChannelEntry
 * @property {ChannelCategory} category
 * @property {string} platform
 * @property {string} url
 * @property {ChannelSource[]} sources
 * @property {ChannelAccountType} [accountType]
 * @property {string} [personName]
 * @property {string} [label]
 *
 * @typedef {object} ChannelsResult
 * @property {boolean} ok
 * @property {ChannelEntry[]} channels
 * @property {string} fetchedAt
 * @property {string|null} [error]
 */

/** @type {{ category: ChannelCategory, platform: string, match: (host: string, pathname: string, href: string) => boolean }[]} */
const PLATFORM_RULES = [
  {
    category: 'social',
    platform: 'Meta',
    match: (h) =>
      h === 'facebook.com' ||
      h === 'fb.com' ||
      h === 'fb.me' ||
      h === 'm.facebook.com' ||
      h.endsWith('.facebook.com'),
  },
  {
    category: 'social',
    platform: 'Instagram',
    match: (h) => h === 'instagram.com' || h.endsWith('.instagram.com'),
  },
  {
    category: 'social',
    platform: 'LinkedIn',
    match: (h, pathname) => {
      if (!(h === 'linkedin.com' || h.endsWith('.linkedin.com'))) return false;
      // Company / school / showcase pages only — personal /in/ profiles are handled separately
      return /^\/(company|school|showcase)\/[^/]+/i.test(pathname || '');
    },
  },
  {
    category: 'social',
    platform: 'X',
    match: (h) => h === 'x.com' || h === 'twitter.com' || h.endsWith('.twitter.com') || h === 't.co',
  },
  {
    category: 'social',
    platform: 'Threads',
    match: (h) => h === 'threads.net' || h.endsWith('.threads.net'),
  },
  {
    category: 'social',
    platform: 'TikTok',
    match: (h) => h === 'tiktok.com' || h.endsWith('.tiktok.com'),
  },
  {
    category: 'social',
    platform: 'Pinterest',
    match: (h) => h === 'pinterest.com' || h.endsWith('.pinterest.com') || h === 'pin.it',
  },
  {
    category: 'video',
    platform: 'YouTube',
    match: (h) =>
      h === 'youtube.com' ||
      h === 'youtu.be' ||
      h === 'm.youtube.com' ||
      h.endsWith('.youtube.com'),
  },
  {
    category: 'video',
    platform: 'Vimeo',
    match: (h) => h === 'vimeo.com' || h.endsWith('.vimeo.com'),
  },
  {
    category: 'messaging',
    platform: 'WhatsApp',
    match: (h) =>
      h === 'wa.me' || h === 'api.whatsapp.com' || h === 'chat.whatsapp.com' || h === 'whatsapp.com',
  },
  {
    category: 'messaging',
    platform: 'Telegram',
    match: (h) => h === 't.me' || h === 'telegram.me' || h === 'telegram.org',
  },
  {
    category: 'google_business',
    platform: 'Google Business',
    match: (h, pathname, href) => {
      if (h === 'g.page' || h === 'maps.app.goo.gl' || h === 'goo.gl') return true;
      if (h === 'business.google.com') return true;
      if (h === 'maps.google.com' || h.startsWith('maps.google.')) return true;
      if (h === 'google.com' || h.endsWith('.google.com') || /^google\.[a-z.]+$/i.test(h)) {
        return /\/maps\b/i.test(pathname) || /[?&]q=/i.test(href);
      }
      return false;
    },
  },
  {
    category: 'shop',
    platform: 'Shopify',
    match: (h) => h.endsWith('.myshopify.com') || h === 'myshopify.com' || h === 'shopify.com',
  },
  {
    category: 'shop',
    platform: 'Etsy',
    match: (h) => h === 'etsy.com' || h.endsWith('.etsy.com'),
  },
  {
    category: 'shop',
    platform: 'Amazon',
    match: (h) => h === 'amazon.com' || /^amazon\.[a-z.]+$/i.test(h) || h.endsWith('.amazon.com'),
  },
];

const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'si',
]);

const SHOP_PATH_RE = /\/(shop|store|winkel|webshop|cart|basket|checkout|collections|products)(\/|$)/i;

/**
 * @param {string} host
 */
function stripWww(host) {
  return String(host || '')
    .replace(/^www\./i, '')
    .toLowerCase();
}

/**
 * @param {string} href
 * @param {string} [baseUrl]
 * @returns {URL|null}
 */
function toAbsoluteUrl(href, baseUrl) {
  const raw = String(href || '').trim();
  if (
    !raw ||
    raw.startsWith('mailto:') ||
    raw.startsWith('tel:') ||
    raw.startsWith('javascript:') ||
    raw.startsWith('#')
  ) {
    return null;
  }
  try {
    const url = baseUrl ? new URL(raw, baseUrl) : new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

/**
 * @param {string} href
 * @param {string} [baseUrl]
 */
export function normalizeChannelUrl(href, baseUrl) {
  const url = toAbsoluteUrl(href, baseUrl);
  if (!url) return null;
  url.hash = '';
  /** @type {string[]} */
  const drop = [];
  for (const key of url.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAMS.has(lower)) drop.push(key);
  }
  for (const key of drop) url.searchParams.delete(key);
  let out = url.href;
  if (out.endsWith('/') && url.pathname !== '/') out = out.slice(0, -1);
  return out;
}

/**
 * @param {string} href
 * @param {string} [baseUrl]
 * @param {{ linkText?: string, personName?: string }} [opts]
 * @returns {{ category: ChannelCategory, platform: string, url: string, accountType?: ChannelAccountType, personName?: string, label?: string }|null}
 */
function classifyUrl(href, baseUrl, opts = {}) {
  const normalized = normalizeChannelUrl(href, baseUrl);
  if (!normalized) return null;
  let url;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  const host = stripWww(url.hostname);
  const pathname = url.pathname || '/';

  // Personal LinkedIn profiles → Individual Socials
  if ((host === 'linkedin.com' || host.endsWith('.linkedin.com')) && /^\/in\/[^/]+/i.test(pathname)) {
    const canon = canonicalizePlatformUrl('LinkedIn', url);
    const slugMatch = pathname.match(/^\/in\/([^/]+)/i);
    const fromSlug = slugMatch ? linkedInSlugToName(slugMatch[1]) : '';
    const personName =
      cleanPersonName(opts.personName) || cleanPersonName(opts.linkText) || fromSlug || 'Profile';
    return {
      category: 'individual_social',
      platform: 'LinkedIn',
      url: canon,
      accountType: 'individual',
      personName,
      label: `LinkedIn - ${personName}`,
    };
  }

  for (const rule of PLATFORM_RULES) {
    if (rule.match(host, pathname, normalized)) {
      const canon = canonicalizePlatformUrl(rule.platform, url);
      const isCompanySocial = rule.category === 'social';
      return {
        category: rule.category,
        platform: rule.platform,
        url: canon,
        accountType: isCompanySocial ? 'company' : undefined,
        label: isCompanySocial ? `${rule.platform} - Company page` : rule.platform,
      };
    }
  }
  return null;
}

/**
 * @param {string} slug
 */
function linkedInSlugToName(slug) {
  const cleaned = decodeURIComponent(String(slug || ''))
    .replace(/\d{5,}$/g, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * @param {string} text
 */
function cleanPersonName(text) {
  const t = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return '';
  if (t.length > 80) return '';
  if (/^(linkedin|connect|follow|profile|view profile|our team|team|meer|lees meer|bekijk)$/i.test(t)) {
    return '';
  }
  // Ignore generic "Name on LinkedIn" noise unless it has a real name part
  const withoutLi = t.replace(/\s+on\s+linkedin$/i, '').trim();
  if (!withoutLi || /^linkedin$/i.test(withoutLi)) return '';
  return withoutLi;
}

/**
 * Collapse profile URLs to a stable root (e.g. LinkedIn company page, not /about).
 * @param {string} platform
 * @param {URL} url
 */
function canonicalizePlatformUrl(platform, url) {
  if (platform === 'LinkedIn') {
    const match = url.pathname.match(/^\/(company|in|school|showcase)\/[^/]+/i);
    if (match) {
      const root = new URL(url.href);
      root.pathname = match[0];
      root.search = '';
      root.hash = '';
      let out = root.href;
      if (out.endsWith('/')) out = out.slice(0, -1);
      return out;
    }
  }
  return url.href.endsWith('/') && url.pathname !== '/' ? url.href.slice(0, -1) : url.href;
}

/**
 * @param {string} handle
 */
function twitterHandleToUrl(handle) {
  const cleaned = String(handle || '')
    .trim()
    .replace(/^@/, '');
  if (!cleaned || /\s/.test(cleaned)) return null;
  if (/^https?:\/\//i.test(cleaned)) return normalizeChannelUrl(cleaned);
  return normalizeChannelUrl(`https://x.com/${cleaned}`);
}

/**
 * @param {Map<string, ChannelEntry>} map
 * @param {{ category: ChannelCategory, platform: string, url: string, accountType?: ChannelAccountType, personName?: string, label?: string }} hit
 * @param {ChannelSource} source
 */
function upsertChannel(map, hit, source) {
  const key = hit.url.toLowerCase();
  const existing = map.get(key);
  if (existing) {
    const seen = new Set(existing.sources.map((s) => `${s.type}|${s.pageUrl}`));
    const sig = `${source.type}|${source.pageUrl}`;
    if (!seen.has(sig)) existing.sources.push(source);
    // Prefer a real person name over a slug-derived one
    if (hit.personName && (!existing.personName || isWeakerPersonName(existing.personName, hit.personName))) {
      existing.personName = hit.personName;
      existing.label = hit.label || `LinkedIn - ${hit.personName}`;
    }
    if (hit.label && !existing.label) existing.label = hit.label;
    if (hit.accountType && !existing.accountType) existing.accountType = hit.accountType;
    return;
  }
  map.set(key, {
    category: hit.category,
    platform: hit.platform,
    url: hit.url,
    sources: [source],
    accountType: hit.accountType,
    personName: hit.personName,
    label: hit.label || hit.platform,
  });
}

/**
 * @param {string} current
 * @param {string} candidate
 */
function isWeakerPersonName(current, candidate) {
  const cur = String(current || '').trim();
  const next = String(candidate || '').trim();
  if (!cur) return true;
  if (!next) return false;
  // Prefer names with spaces (likely full names) over single tokens
  if (!cur.includes(' ') && next.includes(' ')) return true;
  if (cur === 'Profile' && next !== 'Profile') return true;
  return false;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function asUrlList(value) {
  if (!value) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (item && typeof item === 'object' && typeof /** @type {any} */ (item).url === 'string') {
        return [/** @type {any} */ (item).url];
      }
      if (item && typeof item === 'object' && typeof /** @type {any} */ (item)['@id'] === 'string') {
        return [/** @type {any} */ (item)['@id']];
      }
      return [];
    });
  }
  if (typeof value === 'object' && value && typeof /** @type {any} */ (value).url === 'string') {
    return [/** @type {any} */ (value).url];
  }
  return [];
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @param {URL} start
 * @param {Map<string, ChannelEntry>} map
 */
function harvestPageHtml(html, pageUrl, start, map) {
  if (!html) return;
  const $ = cheerio.load(html);

  /**
   * @param {string} href
   * @param {ChannelSourceType} type
   * @param {{ linkText?: string, personName?: string }} [opts]
   */
  const addHref = (href, type, opts = {}) => {
    const abs = toAbsoluteUrl(href, pageUrl);
    if (!abs) return;

    const classified = classifyUrl(abs.href, pageUrl, opts);
    if (classified) {
      upsertChannel(map, classified, { type, pageUrl });
      return;
    }

    if (sameOriginHost(abs, start) && SHOP_PATH_RE.test(abs.pathname)) {
      const url = normalizeChannelUrl(abs.href);
      if (url) {
        upsertChannel(
          map,
          { category: 'shop', platform: 'Shop', url, label: 'Shop' },
          { type: type === 'sameAs' ? 'sameAs' : 'link', pageUrl },
        );
      }
    }
  };

  $('a[href]').each((_, el) => {
    const linkText = $(el).text() || $(el).attr('aria-label') || $(el).attr('title') || '';
    addHref($(el).attr('href') || '', 'link', { linkText });
  });
  $('link[rel="me"]').each((_, el) => {
    addHref($(el).attr('href') || '', 'link');
  });

  const twitterSite = $('meta[name="twitter:site"]').attr('content') || '';
  const twitterCreator = $('meta[name="twitter:creator"]').attr('content') || '';
  for (const handle of [twitterSite, twitterCreator]) {
    const url = twitterHandleToUrl(handle);
    if (!url) continue;
    const hit = classifyUrl(url);
    if (hit) upsertChannel(map, hit, { type: 'meta', pageUrl });
  }

  const ogUrl = $('meta[property="og:url"]').attr('content') || '';
  if (ogUrl) {
    const abs = toAbsoluteUrl(ogUrl, pageUrl);
    if (abs && !sameOriginHost(abs, start)) {
      const hit = classifyUrl(abs.href);
      if (hit) upsertChannel(map, hit, { type: 'meta', pageUrl });
    }
  }

  const htmlLower = html.toLowerCase();
  if (
    htmlLower.includes('cdn.shopify.com') ||
    htmlLower.includes('myshopify.com') ||
    /Shopify\.theme|window\.Shopify/i.test(html)
  ) {
    const shopUrl = normalizeChannelUrl(start.href);
    if (shopUrl) {
      upsertChannel(
        map,
        { category: 'shop', platform: 'Shopify', url: shopUrl, label: 'Shopify' },
        { type: 'signal', pageUrl },
      );
    }
  }

  try {
    const extracted = extractFromHtml(html, pageUrl);
    for (const entity of flattenEntities(extracted.blocks)) {
      const personName = entityName(entity);
      const isPerson = entityIsType(entity, 'Person');
      for (const raw of [...asUrlList(entity.sameAs), ...asUrlList(entity.url)]) {
        const abs = toAbsoluteUrl(raw, pageUrl);
        if (!abs) continue;
        const hit = classifyUrl(abs.href, pageUrl, {
          personName: isPerson ? personName : undefined,
        });
        if (hit) {
          upsertChannel(map, hit, { type: 'sameAs', pageUrl });
          continue;
        }
        if (!sameOriginHost(abs, start)) {
          const host = stripWww(abs.hostname);
          const isNoise =
            host.endsWith('.schema.org') ||
            host === 'schema.org' ||
            host.endsWith('.w3.org') ||
            host.includes('example.com');
          if (!isNoise && !classifyUrl(abs.href)) {
            const url = normalizeChannelUrl(abs.href);
            if (url) {
              upsertChannel(
                map,
                { category: 'website', platform: 'Website', url, label: 'Website' },
                { type: 'sameAs', pageUrl },
              );
            }
          }
        }
      }
    }
  } catch {
    /* ignore parse issues */
  }
}

/**
 * @param {Record<string, unknown>} entity
 * @param {string} typeName
 */
function entityIsType(entity, typeName) {
  const t = entity?.['@type'];
  if (!t) return false;
  if (Array.isArray(t)) return t.map(String).some((x) => x.toLowerCase() === typeName.toLowerCase());
  return String(t).toLowerCase() === typeName.toLowerCase();
}

/**
 * @param {Record<string, unknown>} entity
 */
function entityName(entity) {
  const name = entity?.name;
  if (typeof name === 'string') return cleanPersonName(name);
  if (name && typeof name === 'object' && typeof /** @type {any} */ (name).name === 'string') {
    return cleanPersonName(/** @type {any} */ (name).name);
  }
  return '';
}

/**
 * Harvest sameAs from already-analyzed page.jsonLd when HTML is missing.
 * @param {object} page
 * @param {URL} start
 * @param {Map<string, ChannelEntry>} map
 */
function harvestPageAnalysis(page, start, map) {
  const pageUrl = String(page?.url || '');
  if (!pageUrl) return;

  const blocks = Array.isArray(page?.jsonLd) ? page.jsonLd : [];
  for (const block of blocks) {
    const raw = typeof block === 'string' ? block : typeof block?.json === 'string' ? block.json : '';
    if (!raw) continue;
    try {
      const data = JSON.parse(raw);
      const fakeBlocks = [{ data }];
      for (const entity of flattenEntities(fakeBlocks)) {
        const personName = entityName(entity);
        const isPerson = entityIsType(entity, 'Person');
        for (const value of [...asUrlList(entity.sameAs), ...asUrlList(entity.url)]) {
          const abs = toAbsoluteUrl(value, pageUrl);
          if (!abs) continue;
          const hit = classifyUrl(abs.href, pageUrl, {
            personName: isPerson ? personName : undefined,
          });
          if (hit) {
            upsertChannel(map, hit, { type: 'sameAs', pageUrl });
            continue;
          }
          if (!sameOriginHost(abs, start)) {
            const host = stripWww(abs.hostname);
            if (host.endsWith('.schema.org') || host === 'schema.org') continue;
            const url = normalizeChannelUrl(abs.href);
            if (url && !classifyUrl(url)) {
              upsertChannel(
                map,
                { category: 'website', platform: 'Website', url, label: 'Website' },
                { type: 'sameAs', pageUrl },
              );
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const canonical = page?.meta?.canonical;
  if (canonical) {
    const abs = toAbsoluteUrl(canonical, pageUrl);
    if (abs && !sameOriginHost(abs, start)) {
      const hit = classifyUrl(abs.href);
      if (hit) upsertChannel(map, hit, { type: 'meta', pageUrl });
    }
  }
}

/**
 * Category sort order for UI.
 * @type {Record<ChannelCategory, number>}
 */
export const CHANNEL_CATEGORY_ORDER = {
  social: 1,
  google_business: 2,
  website: 3,
  shop: 4,
  video: 5,
  messaging: 6,
  other: 7,
  individual_social: 8,
};

/**
 * @type {Record<ChannelCategory, string>}
 */
export const CHANNEL_CATEGORY_LABELS = {
  social: 'Socials',
  google_business: 'Google Business',
  website: 'Websites',
  shop: 'Shop',
  video: 'Video',
  messaging: 'Messaging',
  other: 'Other',
  individual_social: 'Individual Socials',
};

/**
 * Detect presence channels from crawled HTML + JSON-LD.
 * @param {{ url?: string, startUrl?: string, pages?: object[], htmlByUrl?: Map<string,string>|Record<string,string> }} input
 * @returns {ChannelsResult}
 */
export function detectChannels(input = {}) {
  /** @type {Map<string, ChannelEntry>} */
  const map = new Map();

  let start;
  try {
    start = normalizeStartUrl(input.url || input.startUrl || '');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, channels: [], fetchedAt: new Date().toISOString(), error: message };
  }

  const primary = normalizeChannelUrl(start.href);
  if (primary) {
    upsertChannel(
      map,
      { category: 'website', platform: 'Website', url: primary, label: 'Website' },
      { type: 'signal', pageUrl: start.href },
    );
  }

  /** @type {Map<string, string>|Record<string, string>} */
  const htmlByUrl = input.htmlByUrl || {};
  const getHtml = (url) => {
    if (htmlByUrl instanceof Map) return htmlByUrl.get(url) || '';
    return htmlByUrl[url] || '';
  };

  const pages = Array.isArray(input.pages) ? input.pages : [];
  /** @type {Set<string>} */
  const seenHtml = new Set();

  for (const page of pages) {
    const pageUrl = String(page?.url || '');
    if (!pageUrl) continue;
    const html = getHtml(pageUrl);
    if (html) {
      harvestPageHtml(html, pageUrl, start, map);
      seenHtml.add(pageUrl);
    } else {
      harvestPageAnalysis(page, start, map);
    }
  }

  const entries =
    htmlByUrl instanceof Map ? [...htmlByUrl.entries()] : Object.entries(htmlByUrl || {});
  for (const [pageUrl, html] of entries) {
    if (seenHtml.has(pageUrl) || !html) continue;
    harvestPageHtml(html, pageUrl, start, map);
  }

  const channels = [...map.values()].sort((a, b) => {
    const ca = CHANNEL_CATEGORY_ORDER[a.category] ?? 99;
    const cb = CHANNEL_CATEGORY_ORDER[b.category] ?? 99;
    if (ca !== cb) return ca - cb;
    const p = a.platform.localeCompare(b.platform);
    if (p !== 0) return p;
    return a.url.localeCompare(b.url);
  });

  return {
    ok: true,
    channels,
    fetchedAt: new Date().toISOString(),
    error: null,
  };
}

/**
 * Alias used by recheck/API.
 * @param {Parameters<typeof detectChannels>[0]} input
 */
export function runChannels(input) {
  return detectChannels(input);
}
