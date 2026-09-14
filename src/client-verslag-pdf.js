/**
 * Build a client verslag PDF (A4) — 2×2 blocks + quick wins.
 */

import PDFDocument from 'pdfkit';

/** @typedef {import('./client-verslag.js').ClientVerslagResult} ClientVerslagResult */

const BLOCK_TITLES = {
  visibility: 'Vindbaarheid',
  presence_trust: 'Aanwezigheid en vertrouwen',
  conversion: 'Conversie, online en naar de winkel',
};

const OWN_FINDINGS_TITLE = 'Eigen bevindingen';

/**
 * @param {ClientVerslagResult} verslag
 * @param {{ url?: string, companyName?: string, generatedAt?: string|null }} [meta]
 * @returns {Promise<Buffer>}
 */
export function buildClientVerslagPdf(verslag, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    /** @type {Buffer[]} */
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headline = String(meta.companyName || meta.url || 'Miniscan verslag').trim();
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text(headline, { align: 'left' });
    if (meta.url) {
      doc.moveDown(0.35);
      doc.font('Helvetica').fontSize(9).fillColor('#666666').text(meta.url);
    }
    if (meta.generatedAt) {
      doc.fontSize(8).text(formatPdfDate(meta.generatedAt));
    }
    doc.moveDown(0.85);
    doc.fillColor('#111111');

    if (verslag.intro) {
      doc.font('Helvetica').fontSize(10.5).text(verslag.intro, { align: 'left', lineGap: 3 });
      doc.moveDown(0.75);
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

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const gutter = 16;
    const colWidth = (pageWidth - gutter) / 2;
    const leftX = doc.page.margins.left;
    const rightX = leftX + colWidth + gutter;

    let rowY = doc.y;
    const h1 = renderBlockBox(doc, gridBlocks[0], leftX, rowY, colWidth);
    const h2 = renderBlockBox(doc, gridBlocks[1], rightX, rowY, colWidth);
    rowY = Math.max(h1, h2) + 14;

    ensureSpace(doc, rowY, 120);
    const h3 = renderBlockBox(doc, gridBlocks[2], leftX, rowY, colWidth);
    const h4 = renderBlockBox(doc, gridBlocks[3], rightX, rowY, colWidth);
    doc.y = Math.max(h3, h4) + 18;

    if (verslag.quickWins?.length) {
      renderQuickWinsFrame(doc, verslag.quickWins, pageWidth, leftX);
    }

    doc.end();
  });
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ title: string, items: { lead: string, text: string }[] }} block
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @returns {number} bottom Y
 */
function renderBlockBox(doc, block, x, y, width) {
  let cy = y;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111111').text(block.title, x, cy, { width });
  cy += doc.heightOfString(block.title, { width }) + 8;

  if (!block.items.length) {
    doc.font('Helvetica').fontSize(9).fillColor('#888888').text('—', x, cy, { width });
    cy += 14;
    return cy;
  }

  for (const item of block.items) {
    cy = ensureSpace(doc, cy, 40);

    const lead = String(item.lead || '').trim();
    const text = String(item.text || '').trim();
    if (lead) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111111').text(`• ${lead}`, x, cy, { width });
      cy += doc.heightOfString(`• ${lead}`, { width }) + 2;
    }
    if (text) {
      doc.font('Helvetica').fontSize(9).fillColor('#555555').text(text, x + 8, cy, { width: width - 8 });
      cy += doc.heightOfString(text, { width: width - 8 }) + 6;
    } else {
      cy += 4;
    }
  }

  return cy;
}

/**
 * Full-width framed Quick wins section.
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ lead: string, text: string }[]} wins
 * @param {number} fullWidth
 * @param {number} leftX
 */
function renderQuickWinsFrame(doc, wins, fullWidth, leftX) {
  const padX = 14;
  const padBody = 12;
  const headerH = 28;
  const contentWidth = fullWidth - padX * 2;
  const gapAfter = 14;

  const bodyH = measureQuickWinsBody(doc, wins, contentWidth);
  const boxH = headerH + padBody + bodyH + padBody;

  let boxY = ensureSpace(doc, doc.y + 6, boxH + gapAfter);

  const border = '#d4d8e0';
  const headerFill = '#fff1e8';
  const accent = '#e07a3a';

  doc.save();
  doc.lineWidth(1).strokeColor(border).fillColor(headerFill);
  doc.rect(leftX, boxY, fullWidth, boxH).stroke();
  doc.rect(leftX, boxY, fullWidth, headerH).fill();
  doc.restore();

  doc.lineWidth(1).strokeColor(border);
  doc.moveTo(leftX, boxY + headerH).lineTo(leftX + fullWidth, boxY + headerH).stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .fillColor(accent)
    .text('Quick wins', leftX + padX, boxY + 9, { width: contentWidth });

  let cy = boxY + headerH + padBody;
  for (const win of wins) {
    const lead = String(win.lead || '').trim();
    const text = String(win.text || '').trim();
    if (lead) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111').text(`• ${lead}`, leftX + padX, cy, {
        width: contentWidth,
        lineGap: 1,
      });
      cy += doc.heightOfString(`• ${lead}`, { width: contentWidth }) + 3;
    }
    if (text) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#444444').text(text, leftX + padX + 6, cy, {
        width: contentWidth - 6,
        lineGap: 2,
      });
      cy += doc.heightOfString(text, { width: contentWidth - 6 }) + 8;
    } else {
      cy += 4;
    }
  }

  doc.y = Math.max(cy, boxY + boxH) + gapAfter;
}

/**
 * @param {import('pdfkit').PDFDocument} doc
 * @param {{ lead: string, text: string }[]} wins
 * @param {number} contentWidth
 */
function measureQuickWinsBody(doc, wins, contentWidth) {
  let h = 0;
  for (const win of wins) {
    const lead = String(win.lead || '').trim();
    const text = String(win.text || '').trim();
    if (lead) {
      doc.font('Helvetica-Bold').fontSize(10);
      h += doc.heightOfString(`• ${lead}`, { width: contentWidth }) + 3;
    }
    if (text) {
      doc.font('Helvetica').fontSize(9.5);
      h += doc.heightOfString(text, { width: contentWidth - 6 }) + 8;
    } else {
      h += 4;
    }
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
  const base = companyNameForVerslag(startUrl, general)
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'verslag';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-miniscan-${stamp}.pdf`;
}
