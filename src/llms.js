import { normalizeStartUrl, withTimeout } from './util.js';

/**
 * @typedef {object} LlmsAnalysis
 * @property {string} url
 * @property {boolean} found
 * @property {number|null} status
 * @property {string|null} contentType
 * @property {string|null} content
 * @property {number|null} score
 * @property {string[]} issues
 * @property {string[]} enhancements
 * @property {string|null} [verdict]
 * @property {string|null} suggestion
 * @property {object} [stats]
 */

/**
 * @param {string} startInput
 * @param {{ timeoutMs?: number }} [options]
 * @returns {Promise<LlmsAnalysis>}
 */
export async function analyzeLlmsTxt(startInput, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const start = normalizeStartUrl(startInput);
  const llmsUrl = new URL('/llms.txt', start.origin).href;

  /** @type {LlmsAnalysis} */
  const result = {
    url: llmsUrl,
    found: false,
    status: null,
    contentType: null,
    content: null,
    score: 0,
    issues: [],
    enhancements: [],
    verdict: null,
    suggestion: null,
    stats: undefined,
  };

  const { signal, clear } = withTimeout(timeoutMs);
  try {
    const res = await fetch(llmsUrl, {
      signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'jsonld-analyze/1.0 (+llms.txt)',
        Accept: 'text/plain,text/markdown,*/*;q=0.8',
      },
    });
    result.status = res.status;
    result.contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (!res.ok) {
      result.found = false;
      result.issues.push(`No llms.txt at ${llmsUrl} (HTTP ${res.status})`);
      result.suggestion = suggestLlmsTxt(start, {});
      result.enhancements.push('Publish a curated /llms.txt so AI agents can discover your key pages');
      return result;
    }

    const trimmed = text.trim();
    if (!trimmed || looksLikeHtmlDocument(trimmed)) {
      result.found = false;
      result.issues.push('Response does not look like an llms.txt Markdown file');
      result.suggestion = suggestLlmsTxt(start, {});
      return result;
    }

    result.found = true;
    result.content = text;
    const scored = scoreLlmsTxt(text, result.contentType);
    result.score = scored.score;
    result.issues = scored.issues;
    result.enhancements = scored.enhancements;
    result.verdict = scored.verdict ?? null;
    result.stats = scored.stats;
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.found = false;
    result.issues.push(`Could not fetch llms.txt: ${message}`);
    result.suggestion = suggestLlmsTxt(start, {});
    return result;
  } finally {
    clear();
  }
}

/**
 * @param {string} text
 */
function looksLikeHtmlDocument(text) {
  const head = text.slice(0, 200).toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

/**
 * @param {string} text
 * @param {string|null} contentType
 */
export function scoreLlmsTxt(text, contentType) {
  /** @type {string[]} */
  const issues = [];
  /** @type {string[]} */
  const enhancements = [];
  let earned = 0;
  let possible = 0;

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const nonEmpty = lines.map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);

  possible += 8;
  if (contentType && /text\/plain|text\/markdown|text\/x-markdown/i.test(contentType)) {
    earned += 8;
  } else if (contentType && /html/i.test(contentType)) {
    issues.push('Content-Type looks like HTML; serve as text/plain; charset=utf-8');
  } else {
    enhancements.push('Serve /llms.txt with Content-Type: text/plain; charset=utf-8');
    earned += 3;
  }

  possible += 18;
  const h1Lines = nonEmpty.filter((l) => /^#\s+\S/.test(l) && !/^##/.test(l));
  const firstNonEmpty = nonEmpty[0] || '';
  if (/^#\s+\S/.test(firstNonEmpty) && !/^##/.test(firstNonEmpty)) {
    earned += 18;
  } else if (h1Lines.length) {
    issues.push('File should start with a single H1 (`# Site Name`)');
    earned += 6;
  } else {
    issues.push('Missing required H1 (`# Site Name`)');
  }
  if (h1Lines.length > 1) {
    issues.push('Multiple H1 headings found — keep exactly one');
  }

  possible += 16;
  const h1Index = lines.findIndex((l) => /^#\s+\S/.test(l.trim()) && !/^##/.test(l.trim()));
  const afterH1 = h1Index >= 0 ? lines.slice(h1Index + 1).find((l) => l.trim()) : null;
  if (afterH1 && /^>\s+\S/.test(afterH1.trim())) {
    earned += 16;
    if (afterH1.trim().length < 20) {
      enhancements.push('Expand the blockquote summary into a clear one-sentence description');
    }
  } else {
    issues.push('Missing blockquote summary (`> …`) immediately after the H1');
  }

  const h2s = nonEmpty.filter((l) => /^##\s+\S/.test(l));
  possible += 12;
  if (h2s.length >= 1) earned += 12;
  else enhancements.push('Add H2 sections (e.g. ## Docs, ## Product) to group key links');

  possible += 4;
  if (h2s.length >= 2) earned += 4;
  else enhancements.push('Use at least two H2 sections to organize important pages');

  const linkRe = /^\s*-\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*:\s*(.*))?$/;
  /** @type {{ title: string, href: string, desc: string }[]} */
  const links = [];
  for (const line of lines) {
    const m = line.match(linkRe);
    if (m) links.push({ title: m[1].trim(), href: m[2].trim(), desc: (m[3] || '').trim() });
  }

  possible += 16;
  if (links.length >= 3) earned += 16;
  else if (links.length >= 1) {
    earned += 8;
    enhancements.push('Add more curated links (aim for about 5–20 high-value pages)');
  } else {
    issues.push('No Markdown links found (`- [Title](https://…): description`)');
  }

  if (links.length > 40) {
    enhancements.push('Too many links — curate the most important 5–20 pages (use llms-full.txt for exhaustive lists)');
  }

  possible += 12;
  const relative = links.filter((l) => !/^https?:\/\//i.test(l.href));
  if (links.length > 0) {
    if (relative.length === 0) earned += 12;
    else {
      issues.push(`${relative.length} link(s) use relative URLs — use absolute https:// URLs`);
      earned += Math.max(0, 12 - relative.length * 2);
    }
  }

  possible += 10;
  const missingDesc = links.filter((l) => !l.desc);
  if (links.length > 0) {
    if (missingDesc.length === 0) earned += 10;
    else {
      enhancements.push(`${missingDesc.length} link(s) lack a short description after the colon`);
      earned += Math.round(10 * ((links.length - missingDesc.length) / links.length));
    }
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  possible += 4;
  if (bytes <= 20 * 1024) earned += 4;
  else issues.push(`File is large (${Math.round(bytes / 1024)} KB) — keep the index concise (under ~20 KB)`);

  if (h2s.some((h) => /^##\s+Optional\s*$/i.test(h))) {
    enhancements.push('Optional section detected — good for lower-priority pages');
  } else if (links.length >= 8) {
    enhancements.push('Consider an `## Optional` section for secondary pages AI can skip');
  }

  if (/<(?:script|html|body|div)\b/i.test(text)) {
    issues.push('Avoid embedding HTML in llms.txt — keep pure Markdown');
  }

  const score = possible > 0 ? Math.max(0, Math.min(100, Math.round((earned / possible) * 100))) : 0;

  /** @type {string|null} */
  let verdict = null;
  if (score >= 80 && issues.length === 0) {
    verdict = 'llms.txt looks solid; optional polish below.';
  } else if (score < 70) {
    verdict = 'llms.txt can be improved — address issues and recommended structure below.';
  }

  return {
    score,
    issues: [...new Set(issues)],
    enhancements: [...new Set(enhancements)],
    verdict,
    stats: {
      bytes,
      h1Count: h1Lines.length,
      h2Count: h2s.length,
      linkCount: links.length,
      linksWithDescription: links.length - missingDesc.length,
    },
  };
}

/**
 * @param {URL} start
 * @param {{ siteName?: string, description?: string, pages?: { title: string, url: string, description?: string }[] }} hints
 */
export function suggestLlmsTxt(start, hints = {}) {
  const origin = start.origin;
  const siteName = hints.siteName || start.hostname.replace(/^www\./i, '');
  const description =
    hints.description ||
    `Overview of ${siteName}: what the site offers and which pages matter most for answering questions.`;

  const defaultPages = hints.pages?.length
    ? hints.pages
    : [
        { title: 'Home', url: `${origin}/`, description: 'Main entry point and overview' },
        { title: 'About', url: `${origin}/about`, description: 'Who you are and what you do' },
        { title: 'Contact', url: `${origin}/contact`, description: 'How to get in touch' },
      ];

  const core = defaultPages
    .slice(0, 12)
    .map((p) => `- [${p.title}](${p.url}): ${p.description || 'Key page'}`)
    .join('\n');

  return `# ${siteName}

> ${description}

## Core

${core}

## Optional

- [Blog](${origin}/blog): News and articles (include only if relevant)
`;
}

/**
 * @param {URL} start
 * @param {import('./analyze.js').PageAnalysis[]} pages
 */
export function hintsFromPages(start, pages) {
  const home = pages.find((p) => {
    try {
      const path = new URL(p.url).pathname;
      return path === '/' || path === '';
    } catch {
      return false;
    }
  });
  const meta = home?.meta;
  const siteName = meta?.siteName || meta?.title || start.hostname.replace(/^www\./i, '');
  const description = meta?.description || meta?.ogDescription || undefined;

  /** @type {{ title: string, url: string, description?: string }[]} */
  const list = [];
  for (const p of pages.slice(0, 15)) {
    const title = p.meta?.title || p.url;
    list.push({
      title: title.slice(0, 80),
      url: p.url,
      description: (p.meta?.description || 'Important page on this site').slice(0, 120),
    });
  }

  return { siteName, description, pages: list };
}
