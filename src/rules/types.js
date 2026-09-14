/**
 * Field rules for common schema.org types (required + recommended).
 * @typedef {object} TypeRule
 * @property {string[]} required
 * @property {string[]} recommended
 * @property {string} [richResultHint]
 */

/** @type {Record<string, TypeRule>} */
export const TYPE_RULES = {
  Organization: {
    required: ['name'],
    recommended: ['url', 'logo', 'sameAs', 'contactPoint', 'address'],
    richResultHint: 'Organization helps Knowledge Graph / brand signals',
  },
  LocalBusiness: {
    required: ['name', 'address'],
    recommended: ['telephone', 'openingHoursSpecification', 'geo', 'url', 'image', 'priceRange'],
    richResultHint: 'LocalBusiness enables local pack / Maps rich results',
  },
  WebSite: {
    required: ['name', 'url'],
    recommended: ['potentialAction', 'publisher', 'description'],
    richResultHint: 'WebSite + SearchAction can enable sitelinks search box',
  },
  WebPage: {
    required: ['name'],
    recommended: ['url', 'description', 'isPartOf', 'breadcrumb', 'primaryImageOfPage'],
  },
  Article: {
    required: ['headline', 'author', 'datePublished', 'image'],
    recommended: ['dateModified', 'publisher', 'mainEntityOfPage', 'description'],
    richResultHint: 'Article can unlock article rich results / Top stories eligibility',
  },
  NewsArticle: {
    required: ['headline', 'author', 'datePublished', 'image'],
    recommended: ['dateModified', 'publisher', 'mainEntityOfPage', 'description'],
  },
  BlogPosting: {
    required: ['headline', 'author', 'datePublished', 'image'],
    recommended: ['dateModified', 'publisher', 'mainEntityOfPage', 'description'],
  },
  Product: {
    required: ['name', 'image'],
    recommended: ['description', 'sku', 'brand', 'offers', 'aggregateRating', 'review'],
    richResultHint: 'Product + Offer (price, availability) enables product rich results',
  },
  Offer: {
    required: ['price', 'priceCurrency', 'availability'],
    recommended: ['url', 'itemCondition'],
  },
  BreadcrumbList: {
    required: ['itemListElement'],
    recommended: [],
    richResultHint: 'BreadcrumbList enables breadcrumb rich results',
  },
  FAQPage: {
    required: ['mainEntity'],
    recommended: [],
    richResultHint: 'FAQPage enables FAQ rich results when Q&A is valid',
  },
  Question: {
    required: ['name', 'acceptedAnswer'],
    recommended: [],
  },
  Person: {
    required: ['name'],
    recommended: ['url', 'image', 'sameAs', 'jobTitle'],
  },
  ImageObject: {
    required: ['url'],
    recommended: ['width', 'height', 'caption'],
  },
};

/**
 * Normalize @type to a list of type names without schema.org prefix.
 * @param {unknown} typeVal
 * @returns {string[]}
 */
export function normalizeTypes(typeVal) {
  if (!typeVal) return [];
  const list = Array.isArray(typeVal) ? typeVal : [typeVal];
  return list.map((t) =>
    String(t)
      .replace(/^https?:\/\/schema\.org\//i, '')
      .trim()
  );
}

/**
 * @param {Record<string, unknown>} entity
 * @param {string} field
 */
export function hasField(entity, field) {
  if (!(field in entity)) return false;
  const v = entity[field];
  if (v == null) return false;
  if (typeof v === 'string' && !v.trim()) return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}
