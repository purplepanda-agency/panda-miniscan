/**
 * Build a client verslag PDF (A4) — 2×2 blocks + deeper todos + site signals.
 */

import PDFDocument from 'pdfkit';
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

const COLORS = {
  ink: '#1a1f2c',
  muted: '#5c6578',
  border: '#d5dae5',
  soft: '#f3f5f9',
  accent: '#ff5a1f',
  accentSoft: '#fff1e8',
  ok: '#1f8f5f',
  miss: '#c23d3d',
  score: '#2f6fed',
};

/**
 * @param {ClientVerslagResult} verslag
 * @param {{ url?: string, companyName?: string, generatedAt?: string|null, signals?: SiteSignals|null }} [meta]
 * @returns {Promise<Buffer>}
 */
export function buildClientVerslagPdf(verslag, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 44 });
    /** @type {Buffer[]} */
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const leftX = doc.page.margins.left;
    const signals = normalizeSiteSignals(meta.signals);

    renderHeader(doc, meta, pageWidth, leftX);
    renderSignalsRow(doc, signals, pageWidth, leftX);

    if (verslag.intro) {
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(COLORS.ink)
        .text(verslag.intro, leftX, doc.y, { width: pageWidth, align: 'left', lineGap: 3 });
      doc.moveDown(0.85);
    }

    /** @type {Record<string, { title: string, items: { lead: string, text: string }[] }>} */
    const byKey = {};
    for (const block of verslag.blocks || []) {
      if (block?.key) {
        byKey[block.key] = {
          title: block.title || BLOCK_TITLES[block.key] || block.key,
          items: block.items || [],
        };
      }
    }

    const gridBlocks = [
      byKey.visibility || { title: BLOCK_TITLES.visibility, items: [] },
      byKey.presence_trust || { title: BLOCK_TITLES.presence_trust, items: [] },
      byKey.conversion || { title: BLOCK_TITLES.conversion, items: [] },
      {
        title: OWN_FINDINGS_TITLE,
        items: verslag.ownFindings || [],
      },
    ];

    const gutter = 14;
    const colWidth = (pageWidth - gutter) / 2;
    const rightX = leftX + colWidth + gutter;

    let rowY = doc.y;
    const h1 = renderBlockBox(doc, gridBlocks[0], leftX, rowY, colWidth, '#7db1ff');
    const h2 = renderBlockBox(doc, gridBlocks[1], rightX, rowY, colWidth, '#5dcea0');
    rowY = Math.max(h1, h2) + 12;

    ensureSpace(doc, rowY, 120);
    const h3 = renderBlockBox(doc, gridBlocks[2], leftX, rowY, colWidth, '#eea53d');
    const h4 = renderBlockBox(doc, gridBlocks[3], rightX, rowY, colWidth, '#9aa3b5');
    doc.y = Math.max(h3, h4) + 16;

    if (verslag.quickWins?.length) {
      renderTodosFrame(doc, verslag.quickWins, pageWidth, leftX);
    }

    doc.end();
  });
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ url?: string, companyName?: string, generatedAt?: string|null }} meta
 * @param {number} pageWidth
 * @param {number} leftX
 */
function renderHeader(doc, meta, pageWidth, leftX) {
  const headline = String(meta.companyName || meta.url || 'Miniscan verslag').trim();

  doc.save();
  doc.rect(leftX, doc.y, pageWidth, 3).fill(COLORS.accent);
  doc.restore();
  doc.moveDown(0.55);

  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.ink).text(headline, { align: 'left' });
  if (meta.url) {
    doc.moveDown(0.25);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(meta.url);
  }
  if (meta.generatedAt) {
    doc.fontSize(8).fillColor(COLORS.muted).text(formatPdfDate(meta.generatedAt));
  }
  doc.moveDown(0.7);
  doc.fillColor(COLORS.ink);
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {SiteSignals} signals
 * @param {number} pageWidth
 * @param {number} leftX
 */
function renderSignalsRow(doc, signals, pageWidth, leftX) {
  const chips = [
    { label: 'Meta', value: formatScore(signals.metaScore), tone: scoreTone(signals.metaScore) },
    { label: 'Sitemap', value: signals.sitemap ? 'Ja' : 'Nee', tone: signals.sitemap ? 'ok' : 'miss' },
    { label: 'Tracking', value: signals.tracking ? 'Ja' : 'Nee', tone: signals.tracking ? 'ok' : 'miss' },
    { label: 'Robots', value: signals.robots ? 'Ja' : 'Nee', tone: signals.robots ? 'ok' : 'miss' },
    { label: 'llms.txt', value: signals.llms ? 'Ja' : 'Nee', tone: signals.llms ? 'ok' : 'miss' },
    { label: 'JSON-LD', value: formatScore(signals.jsonLdScore), tone: scoreTone(signals.jsonLdScore) },
  ];

  const gap = 8;
  const chipW = (pageWidth - gap * (chips.length - 1)) / chips.length;
  const chipH = 36;
  let x = leftX;
  const y = doc.y;

  for (const chip of chips) {
    doc.save();
    doc.roundedRect(x, y, chipW, chipH, 5).fillAndStroke(COLORS.soft, COLORS.border);
    doc.restore();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(chip.label.toUpperCase(), x + 8, y + 6, { width: chipW - 16, lineBreak: false });

    const valueColor =
      chip.tone === 'ok' ? COLORS.ok : chip.tone === 'miss' ? COLORS.miss : chip.tone === 'score' ? COLORS.score : COLORS.ink;
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(valueColor)
      .text(chip.value, x + 8, y + 18, { width: chipW - 16, lineBreak: false });

    x += chipW + gap;
  }

  doc.y = y + chipH + 14;
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
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ title: string, items: { lead: string, text: string }[] }} block
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {string} accent
 * @returns {number} bottom Y
 */
function renderBlockBox(doc, block, x, y, width, accent) {
  const pad = 10;
  const headerH = 26;
  let bodyH = 8;
  if (!block.items.length) {
    bodyH += 16;
  } else {
    for (const item of block.items) {
      const lead = String(item.lead || '').trim();
      const text = String(item.text || '').trim();
      if (lead) {
        doc.font('Helvetica-Bold').fontSize(9);
        bodyH += doc.heightOfString(`• ${lead}`, { width: width - pad * 2 }) + 2;
      }
      if (text) {
        doc.font('Helvetica').fontSize(8.5);
        bodyH += doc.heightOfString(text, { width: width - pad * 2 - 6 }) + 7;
      } else {
        bodyH += 4;
      }
    }
  }
  const boxH = headerH + bodyH + pad;

  let boxY = ensureSpace(doc, y, boxH + 8);

  doc.save();
  doc.roundedRect(x, boxY, width, boxH, 6).fillAndStroke('#ffffff', COLORS.border);
  doc.rect(x, boxY, 4, boxH).fill(accent);
  doc.rect(x, boxY, width, headerH).fill(COLORS.soft);
  doc.restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(block.title, x + pad + 2, boxY + 8, { width: width - pad * 2 - 2 });

  let cy = boxY + headerH + 8;
  if (!block.items.length) {
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('—', x + pad, cy, { width: width - pad * 2 });
    return boxY + boxH;
  }

  for (const item of block.items) {
    const lead = String(item.lead || '').trim();
    const text = String(item.text || '').trim();
    if (lead) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.ink).text(`• ${lead}`, x + pad, cy, {
        width: width - pad * 2,
      });
      cy += doc.heightOfString(`• ${lead}`, { width: width - pad * 2 }) + 2;
    }
    if (text) {
      doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(text, x + pad + 6, cy, {
        width: width - pad * 2 - 6,
        lineGap: 1.5,
      });
      cy += doc.heightOfString(text, { width: width - pad * 2 - 6 }) + 7;
    } else {
      cy += 4;
    }
  }

  return boxY + boxH;
}

/**
 * Full-width framed todos section.
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ lead: string, text: string }[]} todos
 * @param {number} fullWidth
 * @param {number} leftX
 */
function renderTodosFrame(doc, todos, fullWidth, leftX) {
  const padX = 14;
  const padBody = 12;
  const headerH = 30;
  const contentWidth = fullWidth - padX * 2;
  const gapAfter = 12;

  const bodyH = measureTodosBody(doc, todos, contentWidth);
  const boxH = headerH + padBody + bodyH + padBody;

  let boxY = ensureSpace(doc, doc.y + 4, boxH + gapAfter);

  doc.save();
  doc.roundedRect(leftX, boxY, fullWidth, boxH, 7).fillAndStroke('#ffffff', COLORS.border);
  doc.roundedRect(leftX, boxY, fullWidth, headerH, 7).fill(COLORS.accentSoft);
  doc.rect(leftX, boxY + headerH - 7, fullWidth, 7).fill(COLORS.accentSoft);
  doc.restore();

  doc
    .moveTo(leftX, boxY + headerH)
    .lineTo(leftX + fullWidth, boxY + headerH)
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(COLORS.accent)
    .text(TODOS_TITLE, leftX + padX, boxY + 9, { width: contentWidth });

  let cy = boxY + headerH + padBody;
  let index = 1;
  for (const todo of todos) {
    const needed = estimateTodoHeight(doc, todo, contentWidth);
    cy = ensureSpace(doc, cy, needed + 8);
    // If we jumped to a new page mid-box, continue as flowing text (no redraw of frame).
    const lead = String(todo.lead || '').trim();
    const text = String(todo.text || '').trim();

    if (lead) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(COLORS.ink)
        .text(`${index}. ${lead}`, leftX + padX, cy, { width: contentWidth, lineGap: 1 });
      cy += doc.heightOfString(`${index}. ${lead}`, { width: contentWidth }) + 3;
    }
    if (text) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor('#444444')
        .text(text, leftX + padX + 14, cy, { width: contentWidth - 14, lineGap: 2 });
      cy += doc.heightOfString(text, { width: contentWidth - 14 }) + 10;
    } else {
      cy += 6;
    }
    index += 1;
  }

  doc.y = Math.max(cy, boxY + boxH) + gapAfter;
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ lead: string, text: string }[]} todos
 * @param {number} contentWidth
 */
function measureTodosBody(doc, todos, contentWidth) {
  let h = 0;
  let index = 1;
  for (const todo of todos) {
    h += estimateTodoHeight(doc, todo, contentWidth, index);
    index += 1;
  }
  return h;
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ lead: string, text: string }} todo
 * @param {number} contentWidth
 * @param {number} [index]
 */
function estimateTodoHeight(doc, todo, contentWidth, index = 1) {
  let h = 0;
  const lead = String(todo.lead || '').trim();
  const text = String(todo.text || '').trim();
  if (lead) {
    doc.font('Helvetica-Bold').fontSize(10);
    h += doc.heightOfString(`${index}. ${lead}`, { width: contentWidth }) + 3;
  }
  if (text) {
    doc.font('Helvetica').fontSize(9.5);
    h += doc.heightOfString(text, { width: contentWidth - 14 }) + 10;
  } else {
    h += 6;
  }
  return h;
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {number} y
 * @param {number} needed
 * @returns {number}
 */
function ensureSpace(doc, y, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + needed > bottom) {
    doc.addPage();
    return doc.page.margins.top;
  }
  return y;
}

/**
 * @param {string} iso
 */
function formatPdfDate(iso) {
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

/**
 * @param {string} startUrl
 * @param {object|null|undefined} general
 */
export function verslagPdfFilename(startUrl, general) {
  const base =
    companyNameForVerslag(startUrl, general)
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 40) || 'verslag';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-miniscan-${stamp}.pdf`;
}
