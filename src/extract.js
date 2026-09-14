import * as cheerio from 'cheerio';

/**
 * @typedef {object} PageMeta
 * @property {string} title
 * @property {string} description
 * @property {string} canonical
 * @property {string} ogTitle
 * @property {string} ogDescription
 * @property {string} ogImage
 * @property {string} ogType
 * @property {string} siteName
 */

/**
 * @typedef {object} JsonLdBlock
 * @property {unknown} data
 * @property {string} [raw]
 * @property {string} [parseError]
 */

/**
 * @typedef {object} ExtractedPage
 * @property {PageMeta} meta
 * @property {JsonLdBlock[]} blocks
 * @property {string[]} types
 */

/**
 * @param {unknown} node
 * @param {Set<string>} types
 */
function collectTypes(node, types) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, types);
    return;
  }
  /** @type {Record<string, unknown>} */
  const obj = /** @type {Record<string, unknown>} */ (node);
  if (obj['@type']) {
    const t = obj['@type'];
    if (Array.isArray(t)) t.forEach((x) => types.add(String(x)));
    else types.add(String(t));
  }
  if (obj['@graph']) collectTypes(obj['@graph'], types);
}

/**
 * @param {string} html
 * @param {string} pageUrl
 * @returns {ExtractedPage}
 */
export function extractFromHtml(html, pageUrl) {
  const $ = cheerio.load(html || '');
  const title = ($('title').first().text() || '').trim();
  const description =
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    '';
  const canonical =
    $('link[rel="canonical"]').attr('href') ||
    $('meta[property="og:url"]').attr('content') ||
    pageUrl;
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDescription = $('meta[property="og:description"]').attr('content') || '';
  const ogImage = $('meta[property="og:image"]').attr('content') || '';
  const ogType = $('meta[property="og:type"]').attr('content') || '';
  const siteName = $('meta[property="og:site_name"]').attr('content') || '';

  /** @type {JsonLdBlock[]} */
  const blocks = [];
  /** @type {Set<string>} */
  const types = new Set();

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text().trim();
    if (!raw) {
      blocks.push({ data: null, raw: '', parseError: 'Empty JSON-LD script' });
      return;
    }
    try {
      const cleaned = raw.replace(/^\uFEFF/, '');
      const data = JSON.parse(cleaned);
      blocks.push({ data, raw: cleaned });
      collectTypes(data, types);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      blocks.push({ data: null, raw, parseError: message });
    }
  });

  return {
    meta: {
      title,
      description: description.trim(),
      canonical,
      ogTitle: ogTitle.trim(),
      ogDescription: ogDescription.trim(),
      ogImage: ogImage.trim(),
      ogType: ogType.trim(),
      siteName: siteName.trim(),
    },
    blocks,
    types: [...types],
  };
}

/**
 * Flatten all entity objects from JSON-LD blocks.
 * @param {JsonLdBlock[]} blocks
 * @returns {Record<string, unknown>[]}
 */
export function flattenEntities(blocks) {
  /** @type {Record<string, unknown>[]} */
  const entities = [];

  /**
   * @param {unknown} node
   */
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    /** @type {Record<string, unknown>} */
    const obj = /** @type {Record<string, unknown>} */ (node);
    if (obj['@graph']) {
      walk(obj['@graph']);
      // still count container if it has @type
      if (obj['@type']) entities.push(obj);
      return;
    }
    if (obj['@type'] || obj['@id']) entities.push(obj);
  }

  for (const block of blocks) {
    if (block.data != null) walk(block.data);
  }
  return entities;
}
