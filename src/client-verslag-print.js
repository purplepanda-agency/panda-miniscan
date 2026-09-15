/**
 * Printable HTML client verslag (open in new tab → save / print).
 */

import { normalizeSiteSignals } from './site-signals.js';

/** @typedef {import('./client-verslag.js').ClientVerslagResult} ClientVerslagResult */
/** @typedef {import('./site-signals.js').SiteSignals} SiteSignals */

const BLOCK_TITLES = {
  visibility: 'Vindbaarheid',
  presence_trust: 'Aanwezigheid en vertrouwen',
  conversion: 'Conversie, online en naar de winkel',
};

const OWN_FINDINGS_TITLE = 'Eigen bevindingen';
const TODOS_TITLE = 'Aanbevolen to-do’s';

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {ClientVerslagResult} verslag
 * @param {{ url?: string, companyName?: string, generatedAt?: string|null, signals?: SiteSignals|null }} [meta]
 * @returns {string}
 */
export function buildClientVerslagHtml(verslag, meta = {}) {
  const signals = normalizeSiteSignals(meta.signals);
  const headline = String(meta.companyName || meta.url || 'Miniscan verslag').trim();
  const url = meta.url ? String(meta.url) : '';
  const when = meta.generatedAt ? formatPrintDate(meta.generatedAt) : '';

  /** @type {Record<string, { title: string, items: { lead: string, text: string }[], accent: string }>} */
  const byKey = {};
  for (const block of verslag.blocks || []) {
    if (!block?.key) continue;
    byKey[block.key] = {
      title: block.title || BLOCK_TITLES[block.key] || block.key,
      items: block.items || [],
      accent:
        block.key === 'visibility' ? '#7db1ff' : block.key === 'presence_trust' ? '#5dcea0' : '#eea53d',
    };
  }

  const stacked = [
    byKey.visibility || { title: BLOCK_TITLES.visibility, items: [], accent: '#7db1ff' },
    byKey.presence_trust || { title: BLOCK_TITLES.presence_trust, items: [], accent: '#5dcea0' },
    byKey.conversion || { title: BLOCK_TITLES.conversion, items: [], accent: '#eea53d' },
    {
      title: OWN_FINDINGS_TITLE,
      items: verslag.ownFindings || [],
      accent: '#9aa3b5',
    },
  ];

  const signalChips = [
    { label: 'Meta', value: formatScore(signals.metaScore), tone: scoreTone(signals.metaScore) },
    { label: 'Sitemap', value: signals.sitemap ? 'Ja' : 'Nee', tone: signals.sitemap ? 'ok' : 'miss' },
    { label: 'Tracking', value: signals.tracking ? 'Ja' : 'Nee', tone: signals.tracking ? 'ok' : 'miss' },
    { label: 'Robots', value: signals.robots ? 'Ja' : 'Nee', tone: signals.robots ? 'ok' : 'miss' },
    { label: 'llms.txt', value: signals.llms ? 'Ja' : 'Nee', tone: signals.llms ? 'ok' : 'miss' },
    { label: 'JSON-LD', value: formatScore(signals.jsonLdScore), tone: scoreTone(signals.jsonLdScore) },
  ];

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)} — Miniscan verslag</title>
  <style>${printStyles()}</style>
</head>
<body>
  <div class="toolbar no-print">
    <p>Dit verslag kun je opslaan of afdrukken via je browser.</p>
    <div class="toolbar-actions">
      <button type="button" class="btn" onclick="window.print()">Afdrukken / PDF opslaan</button>
    </div>
  </div>

  <main class="page">
    <header class="hero">
      <div class="accent-bar" aria-hidden="true"></div>
      <h1>${escapeHtml(headline)}</h1>
      ${url ? `<p class="meta-line">${escapeHtml(url)}</p>` : ''}
      ${when ? `<p class="meta-line">${escapeHtml(when)}</p>` : ''}
    </header>

    <section class="signals" aria-label="Site signalen">
      ${signalChips
        .map(
          (chip) => `<div class="signal signal--${escapeHtml(chip.tone)}">
        <span class="signal-label">${escapeHtml(chip.label)}</span>
        <span class="signal-value">${escapeHtml(chip.value)}</span>
      </div>`
        )
        .join('')}
    </section>

    ${
      verslag.intro
        ? `<p class="intro">${escapeHtml(verslag.intro)}</p>`
        : ''
    }

    ${stacked.map((block) => renderBlockHtml(block)).join('')}

    ${verslag.quickWins?.length ? renderTodosHtml(verslag.quickWins) : ''}
  </main>
</body>
</html>`;
}

/**
 * @param {{ title: string, items: { lead: string, text: string }[], accent: string }} block
 */
function renderBlockHtml(block) {
  const items = block.items?.length
    ? `<ul class="items">${block.items
        .map((item) => {
          const lead = String(item.lead || '').trim();
          const text = String(item.text || '').trim();
          return `<li>
          ${lead ? `<strong class="item-lead">${escapeHtml(lead)}</strong>` : ''}
          ${text ? `<p class="item-text">${escapeHtml(text)}</p>` : ''}
        </li>`;
        })
        .join('')}</ul>`
    : `<p class="empty">—</p>`;

  return `<section class="block" style="--accent:${escapeHtml(block.accent)}">
    <h2>${escapeHtml(block.title)}</h2>
    ${items}
  </section>`;
}

/**
 * @param {{ lead: string, text: string }[]} todos
 */
function renderTodosHtml(todos) {
  return `<section class="todos">
    <h2>${escapeHtml(TODOS_TITLE)}</h2>
    <ol>
      ${todos
        .map((todo, index) => {
          const lead = String(todo.lead || '').trim();
          const text = String(todo.text || '').trim();
          return `<li>
          ${lead ? `<strong>${escapeHtml(lead)}</strong>` : `<strong>To-do ${index + 1}</strong>`}
          ${text ? `<p>${escapeHtml(text)}</p>` : ''}
        </li>`;
        })
        .join('')}
    </ol>
  </section>`;
}

function printStyles() {
  return `
    :root {
      --ink: #1a1f2c;
      --muted: #5c6578;
      --border: #d5dae5;
      --soft: #f3f5f9;
      --accent: #ff5a1f;
      --ok: #1f8f5f;
      --miss: #c23d3d;
      --score: #2f6fed;
      --font: "DM Sans", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--font);
      color: var(--ink);
      background: #e8ecf2;
      line-height: 1.45;
    }
    .toolbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem 1rem;
      padding: 0.85rem 1.25rem;
      background: #fff;
      border-bottom: 1px solid var(--border);
    }
    .toolbar p { margin: 0; color: var(--muted); font-size: 0.92rem; }
    .toolbar-actions { display: flex; gap: 0.5rem; }
    .btn {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      font: 600 0.9rem var(--font);
      padding: 0.55rem 0.95rem;
      cursor: pointer;
    }
    .btn:hover { filter: brightness(1.05); }
    .page {
      width: min(820px, calc(100% - 2rem));
      margin: 1.25rem auto 2.5rem;
      padding: 2rem 2.1rem 2.4rem;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(26, 31, 44, 0.06);
    }
    .hero { margin-bottom: 1.25rem; }
    .accent-bar {
      width: 100%;
      height: 3px;
      background: var(--accent);
      border-radius: 999px;
      margin-bottom: 0.85rem;
    }
    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.75rem;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }
    .meta-line { margin: 0.15rem 0 0; color: var(--muted); font-size: 0.88rem; }
    .signals {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.5rem;
      margin: 0 0 1.25rem;
    }
    .signal {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--soft);
      padding: 0.45rem 0.6rem;
      min-width: 0;
    }
    .signal-label {
      display: block;
      font-size: 0.68rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 0.15rem;
    }
    .signal-value { font-size: 0.95rem; font-weight: 700; }
    .signal--ok .signal-value { color: var(--ok); }
    .signal--miss .signal-value { color: var(--miss); }
    .signal--score .signal-value { color: var(--score); }
    .intro {
      margin: 0 0 1.25rem;
      font-size: 1rem;
      line-height: 1.55;
    }
    .block, .todos {
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
      margin: 0 0 0.9rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .block h2, .todos h2 {
      margin: 0;
      padding: 0.65rem 0.9rem 0.65rem 1rem;
      font-size: 1rem;
      background: var(--soft);
      border-left: 4px solid var(--accent, #9aa3b5);
      border-bottom: 1px solid var(--border);
    }
    .block h2 { border-left-color: var(--accent); }
    .todos h2 {
      background: #fff1e8;
      color: var(--accent);
      border-left-color: var(--accent);
    }
    .items, .todos ol {
      margin: 0;
      padding: 0.85rem 1rem 1rem 1.35rem;
    }
    .items { list-style: disc; }
    .items li, .todos li { margin: 0 0 0.7rem; }
    .items li:last-child, .todos li:last-child { margin-bottom: 0; }
    .item-lead, .todos strong { display: block; margin-bottom: 0.2rem; }
    .item-text, .todos p {
      margin: 0;
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.5;
    }
    .empty { margin: 0; padding: 0.85rem 1rem; color: var(--muted); }
    @media (max-width: 720px) {
      .signals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .page { padding: 1.25rem 1.1rem 1.6rem; }
    }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .page {
        width: auto;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      .block, .todos, .signals { break-inside: avoid; page-break-inside: avoid; }
    }
  `;
}

/**
 * @param {number|null} score
 */
function formatScore(score) {
  return typeof score === 'number' && Number.isFinite(score) ? String(Math.round(score)) : '—';
}

/**
 * @param {number|null} score
 * @returns {'ok'|'miss'|'score'|'neutral'}
 */
function scoreTone(score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'neutral';
  if (score >= 70) return 'ok';
  if (score < 50) return 'miss';
  return 'score';
}

/**
 * @param {string} iso
 */
function formatPrintDate(iso) {
  try {
    return new Date(iso).toLocaleString('nl-BE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * @param {string} startUrl
 * @param {object|null|undefined} general
 */
export function companyNameForVerslag(startUrl, general) {
  const fromGeneral = general?.companyNameWebsite != null ? String(general.companyNameWebsite).trim() : '';
  if (fromGeneral) {
    const name = fromGeneral.split(/[—–\-|]/)[0].trim();
    if (name) return name;
  }
  try {
    const raw = startUrl.includes('://') ? startUrl : `https://${startUrl}`;
    return new URL(raw).hostname.replace(/^www\./i, '');
  } catch {
    return 'Verslag';
  }
}
