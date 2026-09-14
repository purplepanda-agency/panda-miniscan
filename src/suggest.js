/**
 * Infer page kind and emit a first-pass JSON-LD suggestion.
 * @typedef {import('./extract.js').PageMeta} PageMeta
 */

/**
 * @param {string} url
 * @param {PageMeta} meta
 * @returns {'home'|'article'|'product'|'faq'|'contact'|'generic'}
 */
export function inferPageKind(url, meta) {
  let path = '/';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    /* keep / */
  }
  const og = (meta.ogType || '').toLowerCase();
  const blob = `${path} ${meta.title} ${meta.description}`.toLowerCase();

  if (path === '/' || path === '' || /\/(home|index)\/?$/.test(path)) return 'home';
  if (og === 'article' || /\/(blog|news|articles?|posts?)\//.test(path) || /\b(article|blog)\b/.test(blob)) {
    return 'article';
  }
  if (og === 'product' || /\/(product|products|shop|item)\//.test(path) || /\bproduct\b/.test(blob)) {
    return 'product';
  }
  if (/faq/.test(path) || /\bfaq\b/.test(blob)) return 'faq';
  if (/contact/.test(path) || /\bcontact\b/.test(blob)) return 'contact';
  return 'generic';
}

/**
 * @param {string} url
 * @param {PageMeta} meta
 */
export function suggestForPage(url, meta) {
  const kind = inferPageKind(url, meta);
  const name = meta.ogTitle || meta.title || 'Page title';
  const description = meta.ogDescription || meta.description || '';
  const canonical = meta.canonical || url;
  const image = meta.ogImage || undefined;
  const siteName = meta.siteName || undefined;

  /** @type {Record<string, unknown>} */
  let data;

  if (kind === 'home') {
    data = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          name: siteName || name,
          url: canonical,
          description: description || undefined,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${new URL(canonical).origin}/search?q={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        },
        {
          '@type': 'Organization',
          name: siteName || name,
          url: new URL(canonical).origin,
          logo: image || undefined,
        },
      ],
    };
  } else if (kind === 'article') {
    data = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: name,
      description: description || undefined,
      image: image ? [image] : undefined,
      datePublished: new Date().toISOString().slice(0, 10),
      author: {
        '@type': 'Person',
        name: siteName || 'Author Name',
      },
      publisher: siteName
        ? {
            '@type': 'Organization',
            name: siteName,
            logo: image
              ? {
                  '@type': 'ImageObject',
                  url: image,
                }
              : undefined,
          }
        : undefined,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonical,
      },
    };
  } else if (kind === 'product') {
    data = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name,
      description: description || undefined,
      image: image ? [image] : undefined,
      offers: {
        '@type': 'Offer',
        url: canonical,
        priceCurrency: 'USD',
        price: '0.00',
        availability: 'https://schema.org/InStock',
      },
    };
  } else if (kind === 'faq') {
    data = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'Example question?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Replace with a real answer from this page.',
          },
        },
      ],
    };
  } else if (kind === 'contact') {
    data = {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name,
      url: canonical,
      description: description || undefined,
      isPartOf: siteName
        ? {
            '@type': 'WebSite',
            name: siteName,
            url: new URL(canonical).origin,
          }
        : undefined,
    };
  } else {
    data = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name,
      url: canonical,
      description: description || undefined,
      primaryImageOfPage: image
        ? {
            '@type': 'ImageObject',
            url: image,
          }
        : undefined,
      isPartOf: siteName
        ? {
            '@type': 'WebSite',
            name: siteName,
            url: new URL(canonical).origin,
          }
        : undefined,
    };
  }

  // Strip undefined recursively for clean JSON
  data = stripUndefined(data);

  const json = JSON.stringify(data, null, 2);
  const script = `<script type="application/ld+json">\n${json}\n</script>`;

  return { kind, data, script };
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((v) => v !== undefined);
  }
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const cleaned = stripUndefined(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}
