/**
 * Normalize and validate a crawl start URL.
 * @param {string} input
 * @returns {URL}
 */
export function normalizeStartUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('URL is required');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only http(s) URLs are supported');
  }
  url.hash = '';
  return url;
}

/**
 * Same registrable host check (hostname match, ignore www).
 * @param {URL} a
 * @param {URL} b
 */
export function sameOriginHost(a, b) {
  const strip = (h) => h.replace(/^www\./i, '').toLowerCase();
  return strip(a.hostname) === strip(b.hostname);
}

/**
 * Absolute URL from base + href; returns null if invalid / off-host / non-http.
 * @param {string} href
 * @param {URL} base
 * @param {URL} start
 */
export function resolveSameHostUrl(href, base, start) {
  if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
    return null;
  }
  let url;
  try {
    url = new URL(href, base);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (!sameOriginHost(url, start)) return null;
  url.hash = '';
  return url;
}

const NON_HTML_EXT =
  /\.(pdf|jpg|jpeg|png|gif|webp|svg|ico|css|js|mjs|map|xml|json|zip|gz|mp4|mp3|woff2?|ttf|eot|docx?|xlsx?|pptx?)(\?|$)/i;

/**
 * @param {string} urlStr
 */
export function looksLikeHtmlPath(urlStr) {
  try {
    const u = new URL(urlStr);
    const path = u.pathname || '/';
    if (NON_HTML_EXT.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Simple robots.txt parser for User-agent: * Disallow rules.
 * @param {string} text
 * @param {string} pathname
 */
export function isAllowedByRobots(text, pathname) {
  if (!text) return true;
  const lines = text.split(/\r?\n/);
  let inStar = false;
  /** @type {string[]} */
  const disallows = [];
  for (const line of lines) {
    const trimmed = line.replace(/#.*$/, '').trim();
    if (!trimmed) continue;
    const [key, ...rest] = trimmed.split(':');
    const value = rest.join(':').trim();
    const k = key.toLowerCase();
    if (k === 'user-agent') {
      inStar = value === '*';
      continue;
    }
    if (!inStar) continue;
    if (k === 'disallow') {
      if (value === '') continue;
      disallows.push(value);
    }
  }
  for (const rule of disallows) {
    if (pathname.startsWith(rule)) return false;
  }
  return true;
}

/**
 * @param {number} ms
 * @param {AbortSignal} [parent]
 */
export function withTimeout(ms, parent) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  if (parent) {
    if (parent.aborted) controller.abort();
    else parent.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}
