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
      accent: '#8b7cf0',
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
  <title>${escapeHtml(headline)} — Purple Panda miniscan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet" />
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
      <div class="brand-row">
        <span class="brand-mark" aria-hidden="true"></span>
        <p class="brand-eyebrow">Purple Panda · Miniscan</p>
      </div>
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

    <footer class="page-foot">
      <p>Purple Panda · Be proud, have fun.</p>
    </footer>
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
      --brand: #6c5cdc;
      --brand-soft: #7768de;
      --ink: #1a1830;
      --muted: #5d5a72;
      --border: #d8d5e8;
      --soft: #f4f3fc;
      --soft-2: #ebe9f8;
      --accent: #6c5cdc;
      --ok: #1f8f5f;
      --miss: #c23d3d;
      --score: #5546c4;
      --font: "DM Sans", "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--font);
      color: var(--ink);
      background:
        radial-gradient(ellipse 70% 40% at 50% -8%, rgba(108, 92, 220, 0.16), transparent 55%),
        #ebe9f4;
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
      background: rgba(255, 255, 255, 0.94);
      border-bottom: 1px solid var(--border);
      backdrop-filter: blur(8px);
    }
    .toolbar p { margin: 0; color: var(--muted); font-size: 0.92rem; }
    .toolbar-actions { display: flex; gap: 0.5rem; }
    .btn {
      appearance: none;
      border: 0;
      border-radius: 8px;
      background: var(--brand);
      color: #fff;
      font: 600 0.9rem var(--font);
      padding: 0.55rem 0.95rem;
      cursor: pointer;
    }
    .btn:hover { background: #5748c7; }
    .page {
      width: min(820px, calc(100% - 2rem));
      margin: 1.25rem auto 2.5rem;
      padding: 2rem 2.1rem 1.8rem;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 12px 36px rgba(26, 24, 48, 0.07);
      position: relative;
      overflow: hidden;
    }
    .page::before {
      content: "";
      position: absolute;
      inset: 0 0 auto 0;
      height: 4px;
      background: linear-gradient(90deg, var(--brand), #9b8ef0 55%, var(--brand));
    }
    .hero { margin-bottom: 1.25rem; }
    .brand-row {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin-bottom: 0.7rem;
    }
    .brand-mark {
      width: 0.85rem;
      height: 0.85rem;
      border-radius: 3px;
      background: var(--brand);
      flex-shrink: 0;
    }
    .brand-eyebrow {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--brand-soft);
    }
    h1 {
      margin: 0 0 0.35rem;
      font-size: 1.75rem;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: var(--brand-soft);
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
      background: color-mix(in srgb, var(--brand) 12%, #fff);
      color: var(--brand);
      border-left-color: var(--brand);
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
    .page-foot {
      margin-top: 1.4rem;
      padding-top: 0.85rem;
      border-top: 1px dashed color-mix(in srgb, var(--brand) 28%, var(--border));
      text-align: center;
    }
    .page-foot p {
      margin: 0;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--brand) 55%, var(--muted));
    }
    @media (max-width: 720px) {
      .signals { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .page { padding: 1.4rem 1.1rem 1.4rem; }
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
      .page::before { display: none; }
      .block, .todos, .signals { break-inside: avoid; page-break-inside: avoid; }
      h1 { color: var(--brand); }
      .todos h2 { background: #f0eefc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .signal { background: #f4f3fc !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .block h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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
