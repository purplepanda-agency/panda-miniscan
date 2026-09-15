const form = document.getElementById('form');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const emptyState = document.getElementById('emptyState');
const submitBtn = document.getElementById('submit');
const urlInput = /** @type {HTMLInputElement} */ (document.getElementById('url'));
const landingEl = document.getElementById('landing');
const workspaceEl = document.getElementById('workspace');
const themeToggle = /** @type {HTMLButtonElement|null} */ (document.getElementById('themeToggle'));

const THEME_STORAGE_KEY = 'structa-theme';

/**
 * @returns {'light'|'dark'}
 */
function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* ignore quota / private mode */
  }
  if (themeToggle) {
    const toLight = next === 'dark';
    themeToggle.setAttribute('aria-label', toLight ? 'Switch to light mode' : 'Switch to dark mode');
    themeToggle.title = toLight ? 'Light mode' : 'Dark mode';
  }
}

function initThemeToggle() {
  applyTheme(getTheme());
  themeToggle?.addEventListener('click', () => {
    applyTheme(getTheme() === 'light' ? 'dark' : 'light');
  });
}

initThemeToggle();

const MODEL_STORAGE_KEY = 'structa-ai-model';
const DEFAULT_AI_MODEL = 'gemini-3.1-flash-lite';
const AI_MODEL_OPTIONS = new Set([
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'antigravity-preview-05-2026',
]);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeAiModel(raw) {
  const id = String(raw || '').trim();
  return AI_MODEL_OPTIONS.has(id) ? id : DEFAULT_AI_MODEL;
}

/**
 * @returns {string}
 */
function storedAiModel() {
  try {
    return normalizeAiModel(localStorage.getItem(MODEL_STORAGE_KEY));
  } catch {
    return DEFAULT_AI_MODEL;
  }
}

/**
 * @returns {HTMLSelectElement|null}
 */
function modelSelectEl() {
  return /** @type {HTMLSelectElement|null} */ (document.getElementById('model'));
}

/**
 * @returns {string}
 */
function selectedAiModel() {
  return normalizeAiModel(modelSelectEl()?.value || storedAiModel());
}

/**
 * @param {string} model
 */
function setSelectedAiModel(model) {
  const next = normalizeAiModel(model);
  try {
    localStorage.setItem(MODEL_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  const select = modelSelectEl();
  if (select) select.value = next;
}

/**
 * Model picker HTML for AI insights Generate row.
 * @param {string} [selected]
 */
function renderAiModelSelect(selected) {
  const current = normalizeAiModel(selected || storedAiModel());
  const options = [
    ['gemini-3.1-flash-lite', 'Gemini 3.1 Flash Lite'],
    ['gemini-3.8-flash', 'Gemini 3.8 Flash'],
    ['gemini-3.7-flash', 'Gemini 3.7 Flash'],
    ['gemini-3.6-flash', 'Gemini 3.6 Flash'],
    ['antigravity-preview-05-2026', 'Antigravity'],
  ];
  return `<label class="insights-model-field" title="AI model voor insights">
    <span class="sr-only">AI model</span>
    <select id="model" name="model" aria-label="AI model for insights">
      ${options
        .map(
          ([id, label]) =>
            `<option value="${escapeHtml(id)}"${id === current ? ' selected' : ''}>${escapeHtml(label)}</option>`
        )
        .join('')}
    </select>
  </label>`;
}

function bindInsightsModelSelect() {
  const select = modelSelectEl();
  if (!select || select.dataset.bound === '1') return;
  select.dataset.bound = '1';
  select.addEventListener('change', () => {
    setSelectedAiModel(select.value);
  });
}
/**
 * @param {string} text
 */
function setCompanyTitle(text) {
  const el = /** @type {HTMLElement|null} */ (resultsEl.querySelector('#companyTitle'));
  if (el) el.textContent = text;
}
/** @type {string} */
let lastAnalyzedUrl = '';

/** @type {object|null} */
let lastReport = null;

/** @type {import('@tiptap/core').Editor|null} */
let notesEditor = null;

/** @type {string|null} */
let editingSavedNoteId = null;

function destroyNotesEditor() {
  editingSavedNoteId = null;
  if (notesEditor) {
    notesEditor.destroy();
    notesEditor = null;
  }
}

/**
 * @param {string} text
 * @param {boolean} [show]
 */
function setStatus(text, show = true) {
  statusEl.hidden = !show;
  statusEl.textContent = text;
}

/**
 * @param {'landing'|'workspace'} view
 */
function showView(view) {
  const onLanding = view === 'landing';
  if (onLanding) destroyNotesEditor();
  if (landingEl) landingEl.hidden = !onLanding;
  if (workspaceEl) workspaceEl.hidden = onLanding;
  document.body.classList.toggle('is-workspace', !onLanding);
}

/**
 * Derive a display company name from a URL hostname.
 * @param {string} url
 */
function companyNameFromUrl(url) {
  try {
    const raw = String(url || '').trim();
    if (!raw) return 'Report';
    const withProto = raw.includes('://') ? raw : `https://${raw}`;
    const host = new URL(withProto).hostname.replace(/^www\./i, '');
    const parts = host.split('.').filter(Boolean);
    if (!parts.length) return 'Report';
    const label = parts.length >= 3 ? parts[0] : parts[0];
    return label
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch {
    return 'Report';
  }
}

/**
 * @param {object} report
 */
function companyTitleForReport(report) {
  for (const page of report.pages || []) {
    const siteName = page?.meta?.siteName;
    if (typeof siteName === 'string' && siteName.trim()) return siteName.trim();
  }
  return companyNameFromUrl(report.startUrl || urlInput.value);
}

/**
 * Parse JSON from an API response, with a clear error when HTML comes back
 * (usually means the server needs a restart for new routes).
 * @param {Response} res
 */
async function readApiJson(res) {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(res.ok ? 'Empty response from server' : `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    if (/^<!DOCTYPE|^<html/i.test(trimmed)) {
      throw new Error(
        `Server returned a web page instead of JSON (HTTP ${res.status}). Restart the app server (npm start) and try again.`
      );
    }
    throw new Error(`Invalid JSON from server (HTTP ${res.status}): ${trimmed.slice(0, 160)}`);
  }
}

function clearResults() {
  resultsEl.innerHTML = '';
  lastReport = null;
}

/**
 * Placeholder layout matching the report shell while crawl/analyze runs.
 */
function renderAnalysisSkeleton() {
  resultsEl.hidden = false;
  resultsEl.setAttribute('aria-busy', 'true');
  resultsEl.innerHTML = `
    <div class="skeleton-report" aria-hidden="true">
      <div class="card results-toolbar skeleton-toolbar">
        <div class="results-toolbar-meta">
          <h1 id="companyTitle" class="company-title results-toolbar-name">Report</h1>
          <div class="skeleton-line skeleton-line--lg" style="width:min(22rem, 70%)"></div>
          <div class="skeleton-line skeleton-line--sm" style="width:9rem"></div>
        </div>
        <div class="results-toolbar-actions">
          <div class="skeleton-chip skeleton-chip--wide"></div>
          <div class="results-toolbar-actions-row">
            <div class="skeleton-chip"></div>
            <div class="skeleton-chip"></div>
          </div>
        </div>
      </div>

      <section class="summary-panel">
        <div class="skeleton-line skeleton-line--md" style="width:7rem;margin-bottom:0.85rem"></div>
        <div class="card-grid">
          <article class="stat-card skeleton-stat">
            <div class="skeleton-line skeleton-line--md" style="width:55%"></div>
            <div class="skeleton-line" style="width:92%"></div>
            <div class="skeleton-line" style="width:78%"></div>
            <div class="stat-card-foot">
              <div class="skeleton-chip"></div>
              <div class="skeleton-line skeleton-line--sm" style="width:3rem"></div>
            </div>
          </article>
          <article class="stat-card skeleton-stat">
            <div class="skeleton-line skeleton-line--md" style="width:40%"></div>
            <div class="skeleton-line" style="width:88%"></div>
            <div class="skeleton-line" style="width:70%"></div>
            <div class="stat-card-foot">
              <div class="skeleton-chip"></div>
              <div class="skeleton-line skeleton-line--sm" style="width:4rem"></div>
            </div>
          </article>
        </div>
      </section>

      <div class="results-section">
        <div class="tabs-bar">
          <div class="tabs skeleton-tabs">
            <div class="skeleton-tab"></div>
            <div class="skeleton-tab"></div>
            <div class="skeleton-tab"></div>
          </div>
        </div>
        <div class="card skeleton-panel">
          <div class="skeleton-line skeleton-line--md" style="width:8rem;margin-bottom:1rem"></div>
          <div class="skeleton-rows">
            <div class="skeleton-row">
              <div class="skeleton-line" style="width:42%"></div>
              <div class="skeleton-chip"></div>
            </div>
            <div class="skeleton-row">
              <div class="skeleton-line" style="width:58%"></div>
              <div class="skeleton-chip"></div>
            </div>
            <div class="skeleton-row">
              <div class="skeleton-line" style="width:35%"></div>
              <div class="skeleton-chip"></div>
            </div>
            <div class="skeleton-row">
              <div class="skeleton-line" style="width:64%"></div>
              <div class="skeleton-chip"></div>
            </div>
            <div class="skeleton-row">
              <div class="skeleton-line" style="width:48%"></div>
              <div class="skeleton-chip"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * @param {unknown} data
 * @returns {data is object}
 */
function isReportShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const report = /** @type {Record<string, unknown>} */ (data);
  return Array.isArray(report.pages) && report.summary != null && typeof report.summary === 'object';
}

/**
 * @param {unknown} value
 * @returns {{ business: string, tech: string }|null}
 */
function normalizeDualText(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { business: text, tech: text } : null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = /** @type {Record<string, unknown>} */ (value);
    const business = String(obj.business || obj.Business || obj.text || '').trim();
    const tech = String(obj.tech || obj.Tech || obj.text || business).trim();
    if (!business && !tech) return null;
    return { business: business || tech, tech: tech || business };
  }
  return null;
}

/**
 * @param {unknown} value
 * @param {number} [max]
 * @returns {{ business: string, tech: string }[]}
 */
function normalizeDualList(value, max = 20) {
  if (!Array.isArray(value)) {
    if (typeof value === 'string' && value.trim()) {
      return value
        .split(/\n+/)
        .map((l) => l.replace(/^[-*•]\s*/, '').trim())
        .filter(Boolean)
        .slice(0, max)
        .map((text) => ({ business: text, tech: text }));
    }
    return [];
  }
  /** @type {{ business: string, tech: string }[]} */
  const out = [];
  for (const item of value) {
    const dual = normalizeDualText(item);
    if (dual) out.push(dual);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * @param {{ business: string, tech: string }|null|undefined} dual
 * @param {'business'|'tech'} role
 */
function textForRole(dual, role) {
  if (!dual) return '';
  return role === 'tech' ? dual.tech || dual.business : dual.business || dual.tech;
}

/** @type {{ key: string, label: string, fullWidth?: boolean }[]} */
const GENERAL_FIELD_DEFS = [
  { key: 'companyNameWebsite', label: 'Bedrijfsnaam en website' },
  { key: 'coreOffering', label: 'Kernaanbod, in mijn woorden' },
  {
    key: 'pricingBrands',
    label: 'Prijspositionering (budget, premium, luxe) en belangrijkste merken',
  },
  { key: 'locations', label: 'Fysieke locatie(s) en verzorgingsgebied' },
  {
    key: 'searchTerms',
    label: 'Kernzoektermen waar hun klanten op zoeken (categorie, merk, lokaal)',
  },
  { key: 'competitors', label: 'Concurrenten om mee te vergelijken (lokaal en online)' },
  { key: 'rawData', label: 'Ruwe data die ik zelf verzamelde', fullWidth: true },
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeGeneralFieldText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const obj = /** @type {Record<string, unknown>} */ (item);
          return String(obj.business || obj.tech || obj.text || '').trim();
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    const obj = /** @type {Record<string, unknown>} */ (value);
    return String(obj.business || obj.tech || obj.text || '').trim();
  }
  return String(value);
}

/**
 * @param {unknown} value
 * @returns {object|null}
 */
function normalizeGeneralSection(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const g = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, string>} */
  const fields = {};
  for (const { key } of GENERAL_FIELD_DEFS) {
    fields[key] = normalizeGeneralFieldText(g[key]);
  }

  // Soft-migrate older dual-list general payloads into the new intake fields.
  if (!fields.companyNameWebsite && Array.isArray(g.companyInfo)) {
    fields.companyNameWebsite = normalizeGeneralFieldText(g.companyInfo);
  }
  if (!fields.coreOffering && Array.isArray(g.mainServices)) {
    fields.coreOffering = normalizeGeneralFieldText(g.mainServices);
  }
  if (!fields.searchTerms && Array.isArray(g.onlinePresence)) {
    fields.searchTerms = normalizeGeneralFieldText(g.onlinePresence);
  }

  return {
    ok: g.ok !== false,
    ...fields,
    error: g.error != null ? String(g.error) : null,
    model: g.model != null ? String(g.model) : undefined,
  };
}

/**
 * Persist editable General field values from the DOM into lastReport.
 */
function persistGeneralFieldsFromDom() {
  if (!lastReport?.general || lastReport.general.ok === false) return;
  const fields = { ...lastReport.general };
  resultsEl.querySelectorAll('textarea[data-general-field]').forEach((node) => {
    const el = /** @type {HTMLTextAreaElement} */ (node);
    const key = el.getAttribute('data-general-field');
    if (!key) return;
    fields[key] = el.value;
  });
  lastReport.general = fields;
}

/**
 * Build a stable downloadable report payload (includes General + Quickscan state).
 * @param {object} report
 */
function buildReportPayload(report) {
  const insights = normalizeInsights(report.insights);
  return {
    format: 'structa-report',
    version: 9,
    startUrl: report.startUrl || '',
    analyzedAt: report.analyzedAt || new Date().toISOString(),
    audience: report.audience === 'tech' ? 'tech' : report.audience === 'business' ? 'business' : null,
    summary: report.summary || {},
    pages: Array.isArray(report.pages) ? report.pages : [],
    llms: report.llms ?? null,
    quickscan: report.quickscan ?? null,
    contentQuickscan: report.contentQuickscan ?? null,
    channels: report.channels ?? null,
    general: report.general ?? null,
    signals: report.signals ?? null,
    insights,
  };
}

/**
 * @typedef {{ id: string, html: string, savedAt: string }} SavedNote
 * @typedef {{ id: string, category: string, categoryLabel: string, finding: string, explanation: string, suggestions: string }} AiInsightCard
 * @typedef {{ ok: boolean, cards: AiInsightCard[], generatedAt: string|null, error?: string|null, model?: string }} AiInsightsData
 * @typedef {{ lead: string, text: string }} VerslagLine
 * @typedef {{ key: string, title: string, items: VerslagLine[] }} VerslagBlock
 * @typedef {{ ok: boolean, intro: string, blocks: VerslagBlock[], quickWins: VerslagLine[], ownFindings: VerslagLine[], generatedAt: string|null, error?: string|null, model?: string }} ClientVerslagData
 *
 * @param {unknown} value
 * @returns {{ notesHtml: string, savedNotes: SavedNote[], aiInsights: AiInsightsData, clientVerslag: ClientVerslagData }}
 */
function normalizeInsights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { notesHtml: '', savedNotes: [], aiInsights: normalizeAiInsights(null), clientVerslag: normalizeClientVerslag(null) };
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const savedNotes = Array.isArray(obj.savedNotes)
    ? obj.savedNotes.map(normalizeSavedNote).filter((n) => n != null)
    : [];
  return {
    notesHtml: typeof obj.notesHtml === 'string' ? obj.notesHtml : '',
    savedNotes,
    aiInsights: normalizeAiInsights(obj.aiInsights),
    clientVerslag: normalizeClientVerslag(obj.clientVerslag),
  };
}

/**
 * @param {string} combined
 * @returns {{ lead: string, text: string }}
 */
function splitInsightLeadAndText(combined) {
  const raw = String(combined || '').trim();
  if (!raw) return { lead: '', text: '' };
  const sentence = raw.match(/^(.+?[.!?])(\s+(.+))$/s);
  if (sentence && sentence[1].length <= 120) {
    return { lead: sentence[1].trim(), text: (sentence[3] || '').trim() };
  }
  if (raw.length > 100) {
    const space = raw.indexOf(' ', 65);
    if (space > 20) {
      return { lead: `${raw.slice(0, space).trim()}…`, text: raw };
    }
  }
  return { lead: raw, text: '' };
}

/**
 * @param {unknown} value
 * @returns {ClientVerslagData}
 */
function normalizeClientVerslag(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, intro: '', blocks: [], quickWins: [], ownFindings: [], generatedAt: null, error: null };
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const blocks = Array.isArray(obj.blocks)
    ? obj.blocks
        .map((b) => {
          if (!b || typeof b !== 'object') return null;
          const block = /** @type {Record<string, unknown>} */ (b);
          const key = insightBlockKey(String(block.key || block.category || ''));
          if (!key) return null;
          const items = normalizeVerslagLines(block.items).slice(0, 3);
          if (!items.length) return null;
          return {
            key,
            title: String(block.title || AI_INSIGHT_CATEGORY_LABELS[key] || key),
            items,
          };
        })
        .filter(Boolean)
    : [];
  const quickWins = normalizeVerslagLines(obj.quickWins ?? obj.todos).slice(0, 8);
  let ownFindings = [];
  if (Array.isArray(obj.ownFindings)) {
    ownFindings = normalizeVerslagLines(obj.ownFindings).slice(0, 5);
  } else if (obj.ownFindings && typeof obj.ownFindings === 'object') {
    const of = /** @type {Record<string, unknown>} */ (obj.ownFindings);
    ownFindings = normalizeVerslagLines(of.items).slice(0, 5);
  } else if (Array.isArray(obj.notesParagraphs)) {
    ownFindings = obj.notesParagraphs
      .map((p) => {
        const para = String(p).trim();
        if (!para) return null;
        const m = para.match(/^(.+?[.!?])(\s+([\s\S]+))?$/);
        if (m && m[1].length <= 100) {
          return { lead: m[1].trim(), text: (m[3] || '').trim() };
        }
        return { lead: para, text: '' };
      })
      .filter(Boolean);
  }
  const intro = String(obj.intro || '').trim();
  const ok =
    obj.ok !== false && Boolean(intro || blocks.length || quickWins.length || ownFindings.length);
  return {
    ok,
    intro,
    blocks: /** @type {VerslagBlock[]} */ (blocks),
    quickWins,
    ownFindings,
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : null,
    error: obj.error != null ? String(obj.error) : null,
    model: obj.model != null ? String(obj.model) : undefined,
  };
}

/**
 * @param {unknown} value
 * @returns {VerslagLine[]}
 */
function normalizeVerslagLines(value) {
  if (!Array.isArray(value)) return [];
  /** @type {VerslagLine[]} */
  const out = [];
  for (const raw of value) {
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) out.push({ lead: text, text: '' });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    const obj = /** @type {Record<string, unknown>} */ (raw);
    const lead = String(obj.lead || obj.point || obj.finding || obj.title || '').trim();
    const text = String(obj.text || obj.detail || obj.explanation || '').trim();
    if (!lead && !text) continue;
    out.push({ lead: lead || text.slice(0, 60), text: lead && text ? text : '' });
  }
  return out;
}

/** @type {Record<string, string>} */
const AI_INSIGHT_CATEGORY_LABELS = {
  visibility: 'Vindbaarheid',
  presence_trust: 'Aanwezigheid en vertrouwen',
  conversion: 'Conversie, online en naar de winkel',
  online_visibility: 'Vindbaarheid',
  content_clarity: 'Conversie, online en naar de winkel',
  technical: 'Aanwezigheid en vertrouwen',
  quick_wins: 'Vindbaarheid',
};

/** @type {('visibility'|'presence_trust'|'conversion')[]} */
const AI_INSIGHT_BLOCK_ORDER = ['visibility', 'presence_trust', 'conversion'];

/**
 * @param {string} category
 * @returns {'visibility'|'presence_trust'|'conversion'|null}
 */
function insightBlockKey(category) {
  const raw = String(category || '').trim();
  if (raw === 'visibility' || raw === 'presence_trust' || raw === 'conversion') return raw;
  if (raw === 'online_visibility' || raw === 'quick_wins') return 'visibility';
  if (raw === 'content_clarity') return 'conversion';
  if (raw === 'technical') return 'presence_trust';
  return null;
}

/**
 * @param {unknown} value
 * @returns {AiInsightsData}
 */
function normalizeAiInsights(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, cards: [], generatedAt: null, error: null };
  }
  const obj = /** @type {Record<string, unknown>} */ (value);
  const cards = Array.isArray(obj.cards) ? obj.cards.map(normalizeAiInsightCard).filter((c) => c != null) : [];
  return {
    ok: obj.ok === true && cards.length > 0,
    cards,
    generatedAt: typeof obj.generatedAt === 'string' ? obj.generatedAt : null,
    error: obj.error != null ? String(obj.error) : null,
    model: obj.model != null ? String(obj.model) : undefined,
  };
}

/**
 * @param {unknown} value
 * @returns {AiInsightCard|null}
 */
function normalizeAiInsightCard(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = /** @type {Record<string, unknown>} */ (value);
  const block = insightBlockKey(String(obj.category || '').trim());
  if (!block) return null;
  let finding = String(obj.point || obj.lead || obj.heading || obj.finding || obj.title || '').trim();
  let explanation = String(obj.explanation || obj.uitleg || obj.detail || '').trim();
  if (finding && explanation && finding === explanation) explanation = '';
  if (!explanation && finding) {
    const split = splitInsightLeadAndText(finding);
    finding = split.lead;
    explanation = split.text;
  }
  if (!finding && explanation) {
    const split = splitInsightLeadAndText(explanation);
    finding = split.lead;
    explanation = split.text;
  }
  if (!finding && !explanation) return null;
  return {
    id: typeof obj.id === 'string' && obj.id ? obj.id : `insight-${block}-${Date.now()}`,
    category: block,
    categoryLabel: AI_INSIGHT_CATEGORY_LABELS[block] || block,
    finding,
    explanation,
    suggestions: '',
  };
}

/**
 * @param {AiInsightsData} aiInsights
 */
function renderAiInsightsList(aiInsights) {
  if (!aiInsights.ok && aiInsights.error) {
    return `<div class="issues-box"><strong>Generation failed</strong><p class="muted" style="margin:0.4rem 0 0;color:inherit;">${escapeHtml(aiInsights.error)}</p></div>`;
  }
  if (!aiInsights.cards.length) {
    return '<p class="muted ai-insights-empty">Klik op Generate voor een eerste analyse.</p>';
  }

  /** @type {Record<string, AiInsightCard[]>} */
  const grouped = { visibility: [], presence_trust: [], conversion: [] };
  for (const card of aiInsights.cards) {
    const key = insightBlockKey(card.category);
    if (key && grouped[key]) grouped[key].push(card);
  }

  return `<div class="ai-insights-blocks">${AI_INSIGHT_BLOCK_ORDER.map((blockKey) => {
    const cards = grouped[blockKey] || [];
    if (!cards.length) return '';
    return renderAiInsightBlock(blockKey, cards);
  }).join('')}</div>`;
}

/**
 * @param {'visibility'|'presence_trust'|'conversion'} blockKey
 * @param {AiInsightCard[]} cards
 */
function renderAiInsightBlock(blockKey, cards) {
  const label = AI_INSIGHT_CATEGORY_LABELS[blockKey] || blockKey;
  const items = cards.slice(0, 3);
  const body =
    items.length > 0
      ? `<ul class="insight-block-findings">${items.map((c) => renderAiInsightFinding(c)).join('')}</ul>`
      : `<p class="muted insight-block-empty">Geen onderbouwde bevindingen uit deze snapshot voor dit blok.</p>`;
  return `<section class="insight-block insight-block--${escapeHtml(blockKey)}" aria-labelledby="insight-block-${escapeHtml(blockKey)}">
      <div class="insight-block-header">
        <h4 class="insight-block-title" id="insight-block-${escapeHtml(blockKey)}">${escapeHtml(label)}</h4>
      </div>
      <div class="insight-block-body">${body}</div>
    </section>`;
}

/**
 * @param {AiInsightCard} card
 */
function renderAiInsightFinding(card) {
  const lead = card.finding ? `<span class="insight-finding-point">${escapeHtml(card.finding)}</span>` : '';
  const detail = formatInsightExplanationHtml(card.explanation);
  return `<li class="insight-finding" data-insight-id="${escapeHtml(card.id)}">${lead}${detail}</li>`;
}

/**
 * @param {string|null|undefined} text
 */
function formatInsightExplanationHtml(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const parts = raw
    .split(/\n{2,}|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return parts
    .map((p) => `<p class="insight-finding-explanation">${escapeHtml(p)}</p>`)
    .join('');
}

/**
 * Open printable verslag HTML in a new browser tab.
 * @param {string} html
 */
function openVerslagPrintPage(html) {
  const win = window.open('', '_blank');
  if (!win) {
    setStatus('Kon geen nieuw tabblad openen — sta pop-ups toe voor deze site.');
    return false;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  try {
    win.focus();
  } catch {
    /* ignore */
  }
  return true;
}

function hasGeneratedAiInsights(insights) {
  const { aiInsights } = normalizeInsights(insights);
  return Boolean(aiInsights.ok && aiInsights.cards.length);
}

function syncVerslagPdfMeta() {
  const meta = resultsEl.querySelector('[data-verslag-pdf-meta]');
  const redownload = resultsEl.querySelector('#insightsVerslagRedownload');
  const verslagBtn = resultsEl.querySelector('#insightsVerslag');
  if (!lastReport) return;
  const { clientVerslag } = normalizeInsights(lastReport.insights);
  const canMakePdf = hasGeneratedAiInsights(lastReport.insights);
  if (meta) {
    meta.textContent = clientVerslag.generatedAt
      ? `Laatste verslag: ${formatSavedNoteTime(clientVerslag.generatedAt)}`
      : '';
    meta.hidden = !clientVerslag.ok;
  }
  if (redownload instanceof HTMLButtonElement) {
    redownload.hidden = !clientVerslag.ok;
  }
  if (verslagBtn instanceof HTMLButtonElement) {
    verslagBtn.disabled = !canMakePdf;
    verslagBtn.title = canMakePdf
      ? 'Verslag openen om af te drukken of op te slaan'
      : 'Genereer eerst AI insights';
  }
}

/**
 * Update AI insights cards in the DOM without remounting the notes editor.
 */
function refreshAiInsightsUi() {
  const list = resultsEl.querySelector('[data-ai-insights-list]');
  if (!list || !lastReport) return;
  const { aiInsights } = normalizeInsights(lastReport.insights);
  list.innerHTML = renderAiInsightsList(aiInsights);
  const meta = resultsEl.querySelector('[data-ai-insights-meta]');
  if (meta) {
    meta.textContent = aiInsights.generatedAt
      ? `Generated ${formatSavedNoteTime(aiInsights.generatedAt)}${aiInsights.model ? ` · ${aiInsights.model}` : ''}`
      : '';
    meta.hidden = !aiInsights.generatedAt;
  }
  syncVerslagPdfMeta();
}

/**
 * @param {unknown} value
 * @returns {SavedNote|null}
 */
function normalizeSavedNote(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = /** @type {Record<string, unknown>} */ (value);
  const html = typeof obj.html === 'string' ? obj.html.trim() : '';
  if (!html || html === '<p></p>') return null;
  const savedAt = typeof obj.savedAt === 'string' && obj.savedAt ? obj.savedAt : new Date().toISOString();
  const id = typeof obj.id === 'string' && obj.id ? obj.id : `note-${savedAt}`;
  return { id, html, savedAt };
}

/**
 * @param {string} iso
 */
function formatSavedNoteTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso);
  }
}

/**
 * @param {SavedNote[]} savedNotes
 */
function renderSavedNotesList(savedNotes) {
  if (!savedNotes.length) {
    return '<p class="muted saved-notes-empty">Nog geen notities — typ hierboven en sla op.</p>';
  }
  return savedNotes
    .map(
      (note) => `
    <article class="saved-note-card saved-note-bubble${editingSavedNoteId === note.id ? ' is-editing' : ''}" data-note-id="${escapeHtml(note.id)}">
      <div class="saved-note-meta">
        <time datetime="${escapeHtml(note.savedAt)}">${escapeHtml(formatSavedNoteTime(note.savedAt))}</time>
        <div class="saved-note-actions">
          <button type="button" class="saved-note-action" data-note-edit aria-label="Notitie bewerken">Bewerken</button>
          <button type="button" class="saved-note-action saved-note-action--danger" data-note-delete aria-label="Notitie verwijderen">Verwijderen</button>
        </div>
      </div>
      <div class="saved-note-content notes-prose">${note.html}</div>
    </article>`
    )
    .join('');
}

/**
 * Update saved-notes list in the DOM without remounting the editor.
 */
function refreshSavedNotesUi() {
  const list = resultsEl.querySelector('[data-saved-notes-list]');
  if (!list || !lastReport) return;
  const { savedNotes } = normalizeInsights(lastReport.insights);
  list.innerHTML = renderSavedNotesList(savedNotes);
  bindSavedNotesActions();
  list.scrollTop = list.scrollHeight;
}

function syncNotesSaveButtonLabel() {
  const saveBtn = resultsEl.querySelector('#notesSaveBtn');
  if (!(saveBtn instanceof HTMLButtonElement)) return;
  if (editingSavedNoteId) {
    saveBtn.textContent = 'Bijwerken';
    saveBtn.title = 'Wijzigingen in deze notitie opslaan';
  } else {
    saveBtn.textContent = 'Opslaan';
    saveBtn.title = 'Huidige tekst als notitie opslaan';
  }
}

/**
 * @param {string} noteId
 */
function startEditSavedNote(noteId) {
  if (!lastReport || !notesEditor) return;
  const insights = normalizeInsights(lastReport.insights);
  const note = insights.savedNotes.find((n) => n.id === noteId);
  if (!note) return;

  editingSavedNoteId = noteId;
  notesEditor.commands.setContent(note.html, false);
  persistNotesHtml(note.html);
  refreshSavedNotesUi();
  syncNotesSaveButtonLabel();
  notesEditor.commands.focus('end');

  const composer = resultsEl.querySelector('.insights-notes-composer');
  composer?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  setStatus('Notitie geladen — pas aan en klik Bijwerken.', false);
}

/**
 * @param {string} noteId
 */
function deleteSavedNote(noteId) {
  if (!lastReport) return;
  const insights = normalizeInsights(lastReport.insights);
  const note = insights.savedNotes.find((n) => n.id === noteId);
  if (!note) return;

  if (!window.confirm('Deze opgeslagen notitie verwijderen?')) return;

  lastReport.insights = {
    ...insights,
    savedNotes: insights.savedNotes.filter((n) => n.id !== noteId),
  };

  if (editingSavedNoteId === noteId) {
    editingSavedNoteId = null;
    if (notesEditor) {
      notesEditor.commands.setContent('', false);
      persistNotesHtml('');
    }
    syncNotesSaveButtonLabel();
  }

  refreshSavedNotesUi();
  setStatus('Notitie verwijderd.', false);
}

function bindSavedNotesActions() {
  const list = resultsEl.querySelector('[data-saved-notes-list]');
  if (!list) return;

  list.querySelectorAll('[data-note-edit]').forEach((node) => {
    const btn = /** @type {HTMLButtonElement} */ (node);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const card = btn.closest('[data-note-id]');
      const id = card?.getAttribute('data-note-id');
      if (id) startEditSavedNote(id);
    });
  });

  list.querySelectorAll('[data-note-delete]').forEach((node) => {
    const btn = /** @type {HTMLButtonElement} */ (node);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const card = btn.closest('[data-note-id]');
      const id = card?.getAttribute('data-note-id');
      if (id) deleteSavedNote(id);
    });
  });
}

/**
 * Save the current editor content as a persisted note snapshot.
 */
function saveCurrentNote() {
  if (!lastReport || !notesEditor) return false;
  const html = notesEditor.getHTML().trim();
  if (!html || html === '<p></p>') return false;

  persistNotesHtml(html);
  const insights = normalizeInsights(lastReport.insights);

  if (editingSavedNoteId) {
    const idx = insights.savedNotes.findIndex((n) => n.id === editingSavedNoteId);
    if (idx === -1) {
      editingSavedNoteId = null;
      syncNotesSaveButtonLabel();
      return false;
    }
    const updated = [...insights.savedNotes];
    updated[idx] = {
      ...updated[idx],
      html,
      savedAt: new Date().toISOString(),
    };
    lastReport.insights = { ...insights, savedNotes: updated };
    editingSavedNoteId = null;
    syncNotesSaveButtonLabel();
    refreshSavedNotesUi();
    return true;
  }

  const note = {
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    html,
    savedAt: new Date().toISOString(),
  };
  lastReport.insights = {
    ...insights,
    savedNotes: [...insights.savedNotes, note],
  };
  refreshSavedNotesUi();
  return true;
}

/**
 * @param {object} report
 */
function reportDownloadName(report) {
  let host = 'report';
  try {
    const raw = String(report.startUrl || urlInput.value || 'report');
    const withProto = raw.includes('://') ? raw : `https://${raw}`;
    host = new URL(withProto).hostname.replace(/^www\./i, '') || 'report';
  } catch {
    /* keep default */
  }
  const stamp = String(report.analyzedAt || new Date().toISOString())
    .slice(0, 19)
    .replace(/[:T]/g, (ch) => (ch === 'T' ? '_' : ch === ':' ? '' : '-'));
  return `structa-${host}-${stamp}.json`;
}

/**
 * @param {object} report
 */
function downloadReport(report) {
  const payload = buildReportPayload(report);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = reportDownloadName(report);
  a.click();
  URL.revokeObjectURL(href);
}

/**
 * @param {File} file
 */
async function loadReportFile(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON');
  }
  if (!isReportShape(data)) {
    throw new Error('That JSON file does not look like a Structa report');
  }

  const report = buildReportPayload(data);
  report.general = normalizeGeneralSection(data.general);
  report.insights = normalizeInsights(data.insights);
  // Keep failed general payloads (ok:false) instead of dropping them
  if (data.general && typeof data.general === 'object' && data.general.ok === false) {
    const failed = normalizeGeneralSection({ ...data.general, ok: false }) || {
      ok: false,
      companyNameWebsite: '',
      coreOffering: '',
      pricingBrands: '',
      locations: '',
      searchTerms: '',
      competitors: '',
      rawData: '',
      error: 'General overview unavailable',
    };
    report.general = {
      ...failed,
      ok: false,
      error: data.general.error != null ? String(data.general.error) : 'General overview unavailable',
      model: data.general.model != null ? String(data.general.model) : undefined,
    };
  }
  return report;
}

/**
 * @param {unknown} value
 * @returns {{ business: string, tech: string, suggestion: { business: string, tech: string }|null, evidence: { business: string, tech: string }|null, pages: string[], status: 'open'|'fixed'|'open_still', note?: string|null, checkedAt?: string|null, text: string }}
 */
function normalizeQsItem(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const item = /** @type {Record<string, unknown>} */ (value);
    const dual =
      normalizeDualText(item) ||
      normalizeDualText({
        business: item.business || item.text,
        tech: item.tech || item.text,
      });
    const status =
      item.status === 'fixed' ? 'fixed' : item.status === 'open_still' ? 'open_still' : 'open';
    const business = dual?.business || '';
    const tech = dual?.tech || business;
    const suggestion =
      normalizeDualText(item.suggestion) ||
      normalizeDualText(item.guide) ||
      normalizeDualText(item.fixSuggestion) ||
      normalizeDualText(item.howToFix) ||
      normalizeDualText(item.fix) ||
      (typeof item.suggestion === 'string' || typeof item.guide === 'string' || typeof item.fix === 'string'
        ? normalizeDualText(String(item.suggestion || item.guide || item.fix))
        : null);
    const evidence =
      normalizeDualText(item.evidence) ||
      normalizeDualText(item.examples) ||
      normalizeDualText(item.proof) ||
      normalizeDualText(item.observations) ||
      (typeof item.evidence === 'string' ? normalizeDualText(String(item.evidence)) : null) ||
      (Array.isArray(item.evidence)
        ? normalizeDualText(
            item.evidence
              .map((entry, i) => {
                if (typeof entry === 'string') return `${i + 1}) ${entry}`;
                if (entry && typeof entry === 'object') {
                  const obj = /** @type {Record<string, unknown>} */ (entry);
                  return `${i + 1}) ${String(obj.text || obj.quote || obj.detail || obj.business || obj.tech || '').trim()}`;
                }
                return '';
              })
              .filter(Boolean)
              .join('\n'),
          )
        : null);
    const pagesRaw = Array.isArray(item.pages)
      ? item.pages
      : Array.isArray(item.urls)
        ? item.urls
        : Array.isArray(item.affectedPages)
          ? item.affectedPages
          : [];
    const pages = pagesRaw
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .slice(0, 5);
    return {
      business,
      tech,
      text: business || tech,
      suggestion,
      evidence,
      pages,
      status,
      note: item.note != null ? String(item.note) : null,
      checkedAt: item.checkedAt != null ? String(item.checkedAt) : null,
    };
  }
  const text = String(value || '').trim();
  return {
    business: text,
    tech: text,
    text,
    suggestion: null,
    evidence: null,
    pages: [],
    status: 'open',
    note: null,
    checkedAt: null,
  };
}

/**
 * Ensure quickscan sections use dual business/tech items so fixed state can persist in downloads.
 * @param {object} report
 */
function normalizeReportQuickscan(report) {
  if (!report || typeof report !== 'object') return report;
  for (const key of ['quickscan', 'contentQuickscan']) {
    if (!report[key] || typeof report[key] !== 'object') continue;
    const qs = { ...report[key] };
    if (qs.summary != null) qs.summary = normalizeDualText(qs.summary);
    if (Array.isArray(qs.issues)) {
      qs.issues = qs.issues.map(normalizeQsItem).filter((i) => i.business || i.tech);
    }
    const improvements = Array.isArray(qs.improvements) ? qs.improvements : qs.quickWins;
    if (Array.isArray(improvements)) {
      qs.quickWins = improvements.map(normalizeQsItem).filter((i) => i.business || i.tech);
    }
    report[key] = qs;
  }
  return report;
}

/**
 * Rebuild site summary after a page changes (mirrors server summarizeSite).
 * @param {object[]} pages
 */
function summarizePages(pages) {
  const crawled = pages.length;
  const withValid = pages.filter((p) => p.types && p.types.length > 0).length;
  const without = pages.filter((p) => !p.types || p.types.length === 0).length;

  /** @type {Record<string, number>} */
  const typeCounts = {};
  /** @type {Record<string, number>} */
  const issueCounts = {};

  for (const p of pages) {
    for (const t of p.types || []) typeCounts[t] = (typeCounts[t] || 0) + 1;
    for (const i of p.issues || []) issueCounts[i] = (issueCounts[i] || 0) + 1;
  }

  const topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }));

  const topIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([issue, count]) => ({ issue, count }));

  /** @type {string[]} */
  const quickWins = [];
  if (without > 0) quickWins.push(`Add JSON-LD to ${without} page(s) that have none (see per-page suggestions)`);
  if (topIssues[0]) quickWins.push(`Fix most common issue: ${topIssues[0].issue} (${topIssues[0].count}×)`);
  const lowScores = pages.filter((p) => p.score != null && p.score < 60);
  if (lowScores.length) quickWins.push(`Improve ${lowScores.length} page(s) scoring below 60`);

  const scored = pages.filter((p) => p.score != null);
  const avgScore =
    scored.length > 0 ? Math.round(scored.reduce((s, p) => s + /** @type {number} */ (p.score), 0) / scored.length) : null;

  return {
    crawled,
    withJsonLd: withValid,
    withoutJsonLd: without,
    avgScore,
    topTypes,
    topIssues,
    quickWins,
  };
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @returns {{ tab: string|null, openPages: string[] }}
 */
function captureUiState() {
  const activeTab = resultsEl.querySelector('.tab.is-active')?.getAttribute('data-tab') || null;
  const openPages = [...resultsEl.querySelectorAll('details.page[open]')]
    .map((el) => el.getAttribute('data-page-url') || '')
    .filter(Boolean);
  return { tab: activeTab, openPages };
}

/**
 * @param {{ tab: string|null, openPages: string[] }} state
 */
function restoreUiState(state) {
  // llms / jsonld / quickscan tabs are temporarily hidden in the UI
  const hiddenTabs = new Set(['llms', 'jsonld', 'quickscan', 'contentQuickscan']);
  const tabId = state.tab && hiddenTabs.has(state.tab) ? 'general' : state.tab;
  if (tabId) {
    const tab = resultsEl.querySelector(`.tab[data-tab="${CSS.escape(tabId)}"]`);
    if (tab instanceof HTMLElement) tab.click();
  }
  for (const url of state.openPages || []) {
    const details = [...resultsEl.querySelectorAll('details.page')].find(
      (el) => el.getAttribute('data-page-url') === url
    );
    if (details instanceof HTMLDetailsElement) details.open = true;
  }
}

/**
 * Circular score gauge (0–100). Null/invalid shows an empty ring with an em dash.
 * @param {number|null|undefined} score
 * @param {{ size?: number }} [opts]
 */
function renderScoreRing(score, opts = {}) {
  const size = opts.size ?? 52;
  const stroke = Math.max(4, Math.round(size * 0.1));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const numeric = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null;
  const progress = numeric == null ? 0 : numeric / 100;
  // Leave a small visual gap at the top like the reference
  const usable = circumference * 0.92;
  const dash = numeric == null ? 0 : usable * progress;
  const gap = circumference - dash;
  const label = numeric == null ? '—' : String(Math.round(numeric));
  const tone =
    numeric == null ? 'empty' : numeric >= 86 ? 'good' : numeric >= 70 ? 'mid' : 'low';

  return `<span class="score-ring score-ring--${tone}" style="--score-size:${size}px" title="Score ${label}">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle class="score-ring-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" />
      <circle class="score-ring-value" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"
        stroke-dasharray="${dash} ${gap}" stroke-dashoffset="${circumference * 0.04}" transform="rotate(-90 ${size / 2} ${size / 2})" />
    </svg>
    <span class="score-ring-label">${escapeHtml(label)}</span>
  </span>`;
}

/**
 * @param {string} startUrl
 */
function buildLlmsFallback(startUrl) {
  let origin = 'https://example.com';
  let name = 'example.com';
  try {
    const raw = startUrl.includes('://') ? startUrl : `https://${startUrl}`;
    const u = new URL(raw);
    origin = u.origin;
    name = u.hostname.replace(/^www\./i, '');
  } catch {
    /* keep defaults */
  }

  const suggestion = `# ${name}

> Overview of ${name}: what the site offers and which pages matter most for answering questions.

## Core

- [Home](${origin}/): Main entry point and overview
- [About](${origin}/about): Who you are and what you do
- [Contact](${origin}/contact): How to get in touch

## Optional

- [Blog](${origin}/blog): News and articles (include only if relevant)
`;

  return {
    url: `${origin}/llms.txt`,
    found: false,
    status: null,
    contentType: null,
    content: null,
    score: 0,
    enhancements: ['Publish a curated /llms.txt so AI agents can discover your key pages'],
    suggestion,
    stats: undefined,
  };
}

/**
 * @param {object} report
 */
function resolveLlms(report) {
  if (report.llms && typeof report.llms === 'object') {
    const llms = { ...report.llms };
    if (!llms.found && !llms.suggestion) {
      llms.suggestion = buildLlmsFallback(report.startUrl || urlInput.value).suggestion;
    }
    if (!llms.issues) llms.issues = [];
    if (!llms.enhancements) llms.enhancements = [];
    return llms;
  }
  return buildLlmsFallback(report.startUrl || urlInput.value);
}

/**
 * @param {object} report
 * @param {object} llms
 */
function renderMetrics(report, llms) {
  const summary = report.summary || {};
  const crawled = summary.crawled ?? 0;
  const withJson = summary.withJsonLd ?? 0;
  const coverage = crawled ? Math.round((withJson / crawled) * 100) : 0;
  const llmsFound = Boolean(llms.found);
  const llmsScore = llmsFound ? llms.score : llms.score ?? 0;

  return `
    <section class="summary-panel">
      <h2 class="summary-panel-title">Overview</h2>
      <div class="card-grid">
      <article class="stat-card">
        <div class="stat-card-top">
          <span class="stat-icon teal" aria-hidden="true"></span>
          <h3>JSON-LD coverage</h3>
        </div>
        <p>${withJson} of ${crawled} crawled pages include structured data.</p>
        <div class="stat-card-foot">
          <span class="tag ${coverage > 0 ? 'ok' : 'miss'}">${coverage > 0 ? 'Detected' : 'None found'}</span>
          <span class="stat-meta">${coverage}%</span>
        </div>
      </article>
      <article class="stat-card">
        <div class="stat-card-top">
          <span class="stat-icon navy" aria-hidden="true"></span>
          <h3>llms.txt</h3>
        </div>
        <p>${llmsFound ? 'Root llms.txt found and checked against common structure rules.' : 'No llms.txt found — a starter draft is ready in the tab below.'}</p>
        <div class="stat-card-foot">
          <span class="tag ${llmsFound ? 'ok' : 'miss'}">${llmsFound ? 'Present' : 'Missing'}</span>
          <span class="stat-meta">Score ${llmsScore ?? 0}</span>
        </div>
      </article>
      </div>
    </section>
  `;
}

/**
 * @param {object} report
 */
function renderJsonLdPanel(report) {
  const { summary, pages } = report;
  const quick =
    summary.quickWins?.length > 0
      ? `<ul class="compact">${summary.quickWins.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>`
      : '';

  const types =
    summary.topTypes?.length > 0
      ? `<p class="muted">Types: ${summary.topTypes.map((t) => `${escapeHtml(t.type)} (${t.count})`).join(', ')}</p>`
      : '';

  const pageHtml = (pages || [])
    .map((page, pageIndex) => {
      const has = page.types?.length > 0;
      const actionItems = (page.enhancements || []).filter((i) => !/^overall\s*:/i.test(String(i)));
      const verdictText =
        page.verdict ||
        (page.enhancements || []).find((i) => /^overall\s*:/i.test(String(i)))?.replace(/^overall\s*:\s*/i, '') ||
        '';
      const issues =
        page.issues?.length > 0
          ? `<div class="issues-box"><strong>Issues</strong><ul class="compact issues">${page.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
          : '';
      const enh =
        actionItems.length > 0
          ? `<div class="enhancements-box"><strong>Enhancements</strong><ul class="compact">${actionItems.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
          : '';
      const verdict = verdictText ? `<p class="verdict">${escapeHtml(verdictText)}</p>` : '';
      const currentJsonLd = (page.jsonLd || [])
        .map(
          (block) => `<div class="snippet-block">
            <div class="snippet-head">
              <strong>Current JSON-LD</strong>
              <button type="button" class="ghost copy-btn">Copy</button>
            </div>
            <pre class="copy-source">${escapeHtml(block)}</pre>
          </div>`
        )
        .join('');
      const snippet = page.suggestionScript
        ? `<div class="snippet-block">
            <div class="snippet-head">
              <strong>Suggested JSON-LD</strong>
              <button type="button" class="ghost copy-btn">Copy</button>
            </div>
            <pre class="copy-source">${escapeHtml(page.suggestionScript)}</pre>
          </div>`
        : '';

      return `<details class="page" data-page-url="${escapeHtml(page.url)}" data-page-index="${pageIndex}">
        <summary>
          ${renderScoreRing(page.score)}
          <div class="page-summary-text">
            <span class="page-url">${escapeHtml(page.url)}</span>
            <span class="page-meta-row">
              <span class="badge ${has ? 'ok' : 'miss'}">${has ? 'JSON-LD' : 'missing'}</span>
              <span class="badge">${escapeHtml((page.types || []).join(', ') || '—')}</span>
            </span>
          </div>
          <button type="button" class="ghost check-again-btn" data-recheck="page" data-page-index="${pageIndex}" title="Re-scan this page">Check again</button>
        </summary>
        <div class="page-body">${verdict}${issues}${enh}${currentJsonLd}${snippet}</div>
      </details>`;
    })
    .join('');

  return `
    <div class="card">
      <h3 class="panel-title">JSON-LD summary</h3>
      <ul class="stats">
        <li>Crawled <strong>${summary.crawled}</strong></li>
        <li>With JSON-LD <strong>${summary.withJsonLd}</strong></li>
        <li>Without <strong>${summary.withoutJsonLd}</strong></li>
        <li>Avg score <strong>${summary.avgScore ?? 'n/a'}</strong></li>
      </ul>
      ${types}
      ${quick ? `<div><strong>Quick wins</strong>${quick}</div>` : ''}
    </div>
    <div class="card">
      <h3 class="panel-title">Pages</h3>
      <div class="page-list">${pageHtml}</div>
    </div>
  `;
}

/**
 * @param {object} llms
 */
function renderLlmsPanel(llms) {
  const found = Boolean(llms.found);
  const issues =
    llms.issues?.length > 0
      ? `<div class="issues-box"><strong>Issues</strong><ul class="compact issues">${llms.issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
      : '';
  const enh =
    llms.enhancements?.length > 0
      ? `<div class="enhancements-box"><strong>Enhancements</strong><ul class="compact">${llms.enhancements.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></div>`
      : '';
  const verdict = llms.verdict ? `<p class="verdict">${escapeHtml(llms.verdict)}</p>` : '';

  const stats = llms.stats
    ? `<ul class="stats">
        <li>Links <strong>${llms.stats.linkCount ?? 0}</strong></li>
        <li>Sections <strong>${llms.stats.h2Count ?? 0}</strong></li>
        <li>Described links <strong>${llms.stats.linksWithDescription ?? 0}</strong></li>
        <li>Size <strong>${llms.stats.bytes ?? 0} B</strong></li>
      </ul>`
    : '';

  const existing =
    found && llms.content
      ? `<div class="snippet-block">
        <div class="snippet-head">
          <strong>Current /llms.txt</strong>
          <button type="button" class="ghost copy-btn">Copy</button>
        </div>
        <pre class="copy-source">${escapeHtml(llms.content)}</pre>
      </div>`
      : '';

  const suggestionText =
    llms.suggestion || (!found ? buildLlmsFallback(llms.url || urlInput.value).suggestion : '');
  const suggestion = suggestionText
    ? `<div class="snippet-block">
        <div class="snippet-head">
          <strong>${found ? 'Improved starter (optional)' : 'Suggested llms.txt'}</strong>
          <button type="button" class="ghost copy-btn">Copy</button>
        </div>
        <pre class="copy-source">${escapeHtml(suggestionText)}</pre>
      </div>`
    : `<div class="card"><p class="muted">No suggestion could be generated.</p></div>`;

  return `
    <div class="card">
      <div class="llms-card-head">
        <div>
          <div class="panel-title-row">
            <h3 class="panel-title">llms.txt</h3>
            <button type="button" class="ghost check-again-btn" data-recheck="llms">Check again</button>
          </div>
          <div class="meta-row">
            <span class="meta-label">URL</span>
            <span class="meta-value">${escapeHtml(llms.url || '')}</span>
          </div>
          <ul class="stats">
            <li>Status <strong>${found ? 'found' : 'missing'}</strong></li>
            <li>HTTP <strong>${llms.status ?? '—'}</strong></li>
          </ul>
          <p>
            <span class="badge ${found ? 'ok' : 'miss'}">${found ? 'llms.txt present' : 'llms.txt missing'}</span>
          </p>
        </div>
        ${renderScoreRing(found ? llms.score : llms.score ?? 0, { size: 72 })}
      </div>
      ${stats}
      ${verdict}
      ${issues}
      ${enh}
    </div>
    <div class="stack">
      ${existing}
      ${suggestion}
    </div>
  `;
}

/**
 * @param {'quickscan'|'contentQuickscan'|'general'} section
 * @param {'business'|'tech'|string|null|undefined} current
 * @param {{ showRegen?: boolean }} [opts]
 */
function renderViewRoleControls(section, current, opts = {}) {
  const selected = current === 'tech' ? 'tech' : 'business';
  const regen = opts.showRegen !== false
    ? `<button type="button" class="ghost check-again-btn" data-recheck="${section}-regen">Regenerate</button>`
    : '';
  return `<div class="regen-role">
    <label class="regen-role-field">
      <span class="regen-role-caption">View as</span>
      <select class="view-audience" data-view-section="${section}" aria-label="View as role">
        <option value="business"${selected === 'business' ? ' selected' : ''}>Business developer</option>
        <option value="tech"${selected === 'tech' ? ' selected' : ''}>Tech expert</option>
      </select>
    </label>
    ${regen}
  </div>`;
}

/**
 * @param {'quickscan'|'contentQuickscan'|'general'} section
 * @param {string} title
 */
function renderGenerateFrame(section, title) {
  return `<div class="card generate-frame" data-generate-section="${section}">
      <h3 class="panel-title generate-frame-title">${escapeHtml(title)}</h3>
      <div class="generate-frame-body">
        <button type="button" class="generate-btn check-again-btn" data-recheck="${section}-regen">Generate</button>
      </div>
    </div>`;
}

/**
 * @param {object|null|undefined} quickscan
 * @param {'business'|'tech'|null|undefined} reportAudience
 * @param {{ section?: 'quickscan'|'contentQuickscan', title?: string }} [opts]
 */
function renderQuickscanPanel(quickscan, reportAudience, opts = {}) {
  const section = opts.section === 'contentQuickscan' ? 'contentQuickscan' : 'quickscan';
  const title = opts.title || (section === 'contentQuickscan' ? 'Content Quickscan' : 'Tech Quickscan');
  const role = reportAudience === 'tech' ? 'tech' : 'business';

  if (!quickscan) {
    return renderGenerateFrame(section, title);
  }

  if (!quickscan.ok) {
    return `<div class="card">
      <div class="panel-title-row">
        <h3 class="panel-title">${escapeHtml(title)}</h3>
        ${renderViewRoleControls(section, role)}
      </div>
      <div class="issues-box">
        <strong>Unavailable</strong>
        <p class="muted" style="margin:0.4rem 0 0;color:inherit;">${escapeHtml(quickscan.error || `${title} failed.`)}</p>
      </div>
    </div>`;
  }

  const issues = (quickscan.issues || []).map(normalizeQsItem);
  const wins = (Array.isArray(quickscan.improvements) ? quickscan.improvements : quickscan.quickWins || []).map(
    normalizeQsItem,
  );
  const issueCount = issues.length;
  const winCount = wins.length;
  const fixedCount = [...issues, ...wins].filter((i) => i.status === 'fixed').length;
  const roleLabel = role === 'tech' ? 'Tech expert' : 'Business developer';
  const summaryText = textForRole(normalizeDualText(quickscan.summary), role);
  const summary = summaryText ? `<p class="verdict">${escapeHtml(summaryText)}</p>` : '';
  const focusPages = Array.isArray(quickscan.focusPages) ? quickscan.focusPages.filter(Boolean).slice(0, 8) : [];
  const focusNote =
    section === 'contentQuickscan' && focusPages.length
      ? `<p class="muted qs-focus-pages">Focus pages: ${focusPages
          .map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`)
          .join(' · ')}</p>`
      : '';

  /**
   * @param {ReturnType<typeof normalizeQsItem>} item
   * @param {number} index
   * @param {'issues'|'wins'} kind
   */
  function renderQsItem(item, index, kind) {
    const isFixed = item.status === 'fixed';
    const boxClass = isFixed
      ? 'qs-item qs-item--fixed'
      : kind === 'issues'
        ? 'issues-box qs-item qs-item--issue'
        : 'enhancements-box qs-item qs-item--improvement';
    const label = isFixed ? 'Fixed' : kind === 'issues' ? 'Issue' : 'Improvement';
    const detailLabel = kind === 'issues' ? 'Suggestion' : 'How to implement';
    const note = item.note
      ? `<p class="qs-item-note">${escapeHtml(item.note)}</p>`
      : item.status === 'open_still'
        ? `<p class="qs-item-note">Nog aanwezig op de live site.</p>`
        : '';
    const checkBtn = isFixed
      ? ''
      : `<button type="button" class="ghost check-again-btn" data-recheck="${section}" data-qs-kind="${kind}" data-qs-index="${index}">Check again</button>`;
    const visible = textForRole(item, role);
    const suggestionText = item.suggestion ? textForRole(item.suggestion, role) : '';
    const evidenceText = item.evidence ? textForRole(item.evidence, role) : '';
    const pages = Array.isArray(item.pages) ? item.pages.filter(Boolean).slice(0, 5) : [];
    const pagesBlock =
      pages.length > 0
        ? `<div class="qs-item-pages">
            <span class="qs-item-suggestion-label">Pages</span>
            <ul class="qs-item-page-list">${pages
              .map(
                (url) =>
                  `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></li>`,
              )
              .join('')}</ul>
          </div>`
        : '';

    if (!isFixed) {
      const evidenceBlock = evidenceText
        ? `<div class="qs-item-evidence">
            <span class="qs-item-suggestion-label">Evidence</span>
            <p class="qs-item-evidence-text">${escapeHtml(evidenceText)}</p>
          </div>`
        : '';
      const suggestionBlock =
        suggestionText || evidenceBlock || pagesBlock
          ? `<div class="qs-item-suggestion">
              ${evidenceBlock}
              ${
                suggestionText
                  ? `<span class="qs-item-suggestion-label">${detailLabel}</span>
                     <p class="qs-item-suggestion-text">${escapeHtml(suggestionText)}</p>`
                  : `<p class="muted qs-item-suggestion-text">No ${kind === 'issues' ? 'fix suggestion' : 'implementation guide'} available.</p>`
              }
              ${pagesBlock}
            </div>`
          : `<div class="qs-item-suggestion"><p class="muted qs-item-suggestion-text">No ${kind === 'issues' ? 'fix suggestion' : 'implementation guide'} available.</p></div>`;

      return `<details class="${boxClass}" data-qs-box="${kind}">
        <summary class="qs-item-summary">
          <div class="qs-item-head">
            <span class="qs-item-label">${label}</span>
            ${checkBtn}
          </div>
          <div class="qs-item-main">
            <p class="qs-item-text">${escapeHtml(visible)}</p>
            <span class="qs-item-chevron" aria-hidden="true"></span>
          </div>
        </summary>
        <div class="qs-item-body">
          ${suggestionBlock}
          ${note}
        </div>
      </details>`;
    }

    return `<div class="${boxClass}" data-qs-box="${kind}">
      <div class="qs-item-head">
        <span class="qs-item-label">${label}</span>
      </div>
      <p class="qs-item-text">${escapeHtml(visible)}</p>
      ${note}
    </div>`;
  }

  const issueItems =
    issueCount > 0
      ? issues.map((item, index) => renderQsItem(item, index, 'issues')).join('')
      : `<p class="muted qs-empty" data-qs-box="issues">No clear issues found — looks in good shape.</p>`;
  const winItems =
    winCount > 0
      ? wins.map((item, index) => renderQsItem(item, index, 'wins')).join('')
      : `<p class="muted qs-empty" data-qs-box="wins">No extra improvements suggested.</p>`;

  return `<div class="card" data-qs-root="${section}">
      <div class="panel-title-row">
        <h3 class="panel-title">${escapeHtml(title)}</h3>
        ${renderViewRoleControls(section, role)}
      </div>
      <p class="muted">Showing ${escapeHtml(roleLabel)} wording${quickscan.model ? ` · ${escapeHtml(quickscan.model)}` : ''}${fixedCount ? ` · ${fixedCount} marked fixed` : ''}.</p>
      ${focusNote}
      ${summary}
      <div class="qs-filters" role="tablist" aria-label="${escapeHtml(title)} filter">
        <button type="button" class="qs-filter is-active" data-qs-filter="all" aria-selected="true">All</button>
        <button type="button" class="qs-filter" data-qs-filter="issues" aria-selected="false">Issues (${issueCount})</button>
        <button type="button" class="qs-filter" data-qs-filter="wins" aria-selected="false">Improvements (${winCount})</button>
      </div>
      <div class="stack qs-lists" style="margin-top:0.85rem;">
        ${issueItems}
        ${winItems}
      </div>
    </div>`;
}

/**
 * Simple brand mark for a channel platform.
 * @param {string} platform
 */
function channelLogoSvg(platform) {
  const key = String(platform || '')
    .trim()
    .toLowerCase();
  const common = 'class="channels-logo-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
  /** @type {Record<string, string>} */
  const icons = {
    meta: `<svg ${common}><path fill="currentColor" d="M12 2C6.5 2 2 6.2 2 11.5c0 3.3 1.7 6.2 4.3 8.1V22l3.9-2.1c.6.1 1.2.2 1.8.2 5.5 0 10-4.2 10-9.6S17.5 2 12 2zm1.1 12.9h-1.7l-.4-1.7H8.9L8.5 14.9H6.8l2.5-7.4h2.4l2.4 7.4zm-2.5-3.1.7-2.8.7 2.8h-1.4zM17.2 14.9h-1.6v-4.6l-1.7 4.6h-1.5l-1.7-4.6v4.6h-1.6V7.5h2.4l1.7 4.5 1.7-4.5h2.3v7.4z"/></svg>`,
    instagram: `<svg ${common}><path fill="currentColor" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2zm-.2 2A3.6 3.6 0 0 0 4 7.6v8.8A3.6 3.6 0 0 0 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6A3.6 3.6 0 0 0 16.4 4H7.6zm9.65 1.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>`,
    linkedin: `<svg ${common}><path fill="currentColor" d="M4.98 3.5C4.98 4.88 3.88 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V23h-4V8.5zM8.5 8.5h3.8v2h.1c.5-1 1.8-2.1 3.8-2.1 4 0 4.8 2.7 4.8 6.1V23h-4v-6.6c0-1.6 0-3.6-2.2-3.6s-2.5 1.7-2.5 3.5V23h-4V8.5z"/></svg>`,
    x: `<svg ${common}><path fill="currentColor" d="M18.9 2H22l-6.8 7.8L23 22h-6.5l-5.1-6.7L5.7 22H2.5l7.3-8.3L1 2h6.7l4.6 6.1L18.9 2zm-1.1 18h1.8L6.3 3.9H4.4L17.8 20z"/></svg>`,
    threads: `<svg ${common}><path fill="currentColor" d="M12.2 2c4.9 0 7.9 3.1 8 7.1h-2.2c-.2-2.8-1.9-4.8-5.7-4.8-3.5 0-5.9 2.3-5.9 6.1 0 5.1 3.3 7.1 7.1 7.1 1.9 0 3.5-.4 4.6-1v-3.5c-.8.5-2.1.8-3.4.8-2.3 0-3.9-1.2-4-3.2h8.6v-1c0-4.4-2.8-7.6-7.1-7.6zm1.1 9.4h-4.3c.2 1.4 1.3 2.3 3 2.3.8 0 1.7-.2 2.3-.5v-1.8h-1z"/></svg>`,
    tiktok: `<svg ${common}><path fill="currentColor" d="M19.6 7.2a6.7 6.7 0 0 1-3.9-1.2v8.1a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1v2.9a3 3 0 1 0 2.1 2.9V2h2.9a6.7 6.7 0 0 0 3.9 3.8v1.4z"/></svg>`,
    pinterest: `<svg ${common}><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12c0 4.2 2.6 7.8 6.3 9.2-.1-.8-.2-2 0-2.9.2-.8 1.3-5.5 1.3-5.5s-.3-.7-.3-1.6c0-1.5.9-2.7 2-2.7.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.5-.3 1.1.5 1.9 1.5 1.9 1.8 0 3.2-1.9 3.2-4.7 0-2.5-1.8-4.2-4.3-4.2-2.9 0-4.7 2.2-4.7 4.5 0 .9.3 1.8.8 2.3.1.1.1.2.1.3l-.3 1.2c0 .2-.1.2-.3.1-1.4-.6-2.2-2.6-2.2-4.2 0-3.4 2.5-6.6 7.1-6.6 3.7 0 6.6 2.7 6.6 6.2 0 3.7-2.3 6.7-5.6 6.7-1.1 0-2.1-.6-2.5-1.2l-.7 2.6c-.2.9-.9 2-1.4 2.7 1 .3 2.1.5 3.2.5 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg>`,
    youtube: `<svg ${common}><path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31.5 31.5 0 0 0 0 12a31.5 31.5 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31.5 31.5 0 0 0 24 12a31.5 31.5 0 0 0-.5-5.8zM9.8 15.5v-7l6.3 3.5-6.3 3.5z"/></svg>`,
    vimeo: `<svg ${common}><path fill="currentColor" d="M23.9 6.3c-.1 1.8-1.3 4.3-3.8 7.4-2.5 3.2-4.7 4.8-6.4 4.8-1.1 0-2-.9-2.8-2.8L9.3 9.3c-.6-1.9-1.2-2.8-1.8-2.8-.2 0-.9.4-2.1 1.2L4.2 6.4C6.5 4.4 8.7 3.3 10.7 3.2c2.3-.1 3.7 1.3 4.2 4.3.5 3.2.9 5.2 1.1 5.9.6 2.6 1.3 3.9 2 3.9.6 0 1.4-.9 2.6-2.6 1.1-1.8 1.7-3.1 1.8-4 .1-1.5-.4-2.2-1.8-2.2-.6 0-1.3.1-2 .4 1.4-4.5 4-6.7 7.9-6.5 2.9.1 4.2 1.9 4.1 5.3z"/></svg>`,
    whatsapp: `<svg ${common}><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 1.8a8.2 8.2 0 0 1 6.9 12.5l-.3.4.7 2.7-2.8-.7-.4.2A8.2 8.2 0 1 1 12 3.8zm4.6 10.4c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.7.9-.1.2-.3.2-.5.1-.2-.1-.9-.3-1.8-1.1-.7-.6-1.1-1.3-1.3-1.5-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.3-.4.1-.2 0-.3 0-.4 0-.1-.5-1.3-.7-1.8-.2-.5-.4-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4 2.3.9 2.3.6 2.7.6.4 0 1.3-.5 1.5-1 .2-.5.2-.9.1-1z"/></svg>`,
    telegram: `<svg ${common}><path fill="currentColor" d="M9.8 15.4 9.5 19c.4 0 .6-.2.8-.4l2-1.9 4.1 3c.8.4 1.3.2 1.5-.7L21.8 5c.3-1.2-.4-1.7-1.2-1.4L2.9 10.3C1.7 10.8 1.7 11.5 2.7 11.8l4.4 1.4 10.2-6.4c.5-.3.9-.1.5.2L9.8 15.4z"/></svg>`,
    'google business': `<svg ${common}><path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"/></svg>`,
    shopify: `<svg ${common}><path fill="currentColor" d="M15.1 3.2s-.2 0-.2.1l-1.4.4C13.3 2.5 12.5 1.8 11.6 1.8c-.1 0-.2 0-.3.1-.1 0-.1.1-.2.1L9.5 2.5C9 1.8 8.2 1.4 7.5 1.4 5.8 1.4 4.4 3 4.1 5.2L1.9 5.9c-.3.1-.3.1-.3.4L.5 20.1c0 .2.1.3.3.3l4.3 1c.1 0 .2 0 .2-.1l1.1.3c.1 0 .1 0 .2-.1l13.6-3.3c.2 0 .3-.2.3-.4L21.6 5c0-.2-.1-.3-.3-.4l-6.2-1.4zM11.6 3.5c.4 0 .8.2 1.1.6l-2.3.6c.2-1 .7-1.2 1.2-1.2zm-4.1-.3c.4 0 .9.3 1.3 1L6.3 5c.2-1.1.8-1.8 1.2-1.8z"/></svg>`,
    etsy: `<svg ${common}><path fill="currentColor" d="M3 4h8.5v2.2H5.8v4.1H10V12H5.8v5.8H12V20H3V4zm13.2 5.2c2.2 0 3.6 1.2 3.8 3.1h-2.3c-.1-.8-.7-1.3-1.5-1.3-1.2 0-2 1-2 2.9s.8 2.9 2 2.9c.9 0 1.5-.6 1.6-1.5h2.3c-.2 2-1.7 3.3-3.9 3.3-2.6 0-4.3-1.9-4.3-4.7s1.7-4.7 4.3-4.7z"/></svg>`,
    amazon: `<svg ${common}><path fill="currentColor" d="M14.5 12.2c-1.7.8-3.5 1.1-5.1 1.1-2.4 0-4.6-.7-6.4-1.9-.3-.2-.1-.4.1-.3 2.2 1.3 4.9 2 7.4 2 1.7 0 3.8-.4 5.5-1.1.4-.1.6.2.5.4-.2.4-.8.7-1.3.8zm1.7-1.1c-.2-.2-.9-.1-1.3 0-.1 0-.2-.1-.1-.2.5-.6 1.4-.4 1.5-.2.1.2-.1 1.5-.6 2.1 0 .1-.1.1-.2 0-.5-.4.1-1.1.7-1.7zM11.1 8.1c0-.8.1-1.8.6-2.5.5-.8 1.2-1.2 1.9-1.2.1 1-.3 2-1 2.7-.5.6-1.2 1-1.5 1zm4.6-3.8c-.1 0-.3-.1-.3-.2 0-.1.1-.2.2-.3 1-.9 2.5-.8 2.7-.8.1 0 .1.1.1.2-.1 1.2-.8 2.4-1.6 3.2-.1.1-.2.1-.3 0-.1-.1-.1-.2 0-.3.6-.7 1.1-1.5 1.2-2.3-.7.1-1.5.3-2 .5z"/></svg>`,
    shop: `<svg ${common}><path fill="currentColor" d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM3.2 3l1.1 2h15.9l-1.8 8.2H7.1L6.8 15h12.5v2H4.7l.8-3.5L3 4H1V2h2.2z"/></svg>`,
    website: `<svg ${common}><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.9 9h-3.2a15 15 0 0 0-1.3-5 8.1 8.1 0 0 1 4.5 5zM12 4c.9 0 2.3 1.8 3 5H9c.7-3.2 2.1-5 3-5zM4.1 13h3.2a15 15 0 0 0 1.3 5 8.1 8.1 0 0 1-4.5-5zm3.2-2H4.1a8.1 8.1 0 0 1 4.5-5 15 15 0 0 0-1.3 5zM12 20c-.9 0-2.3-1.8-3-5h6c-.7 3.2-2.1 5-3 5zm2.4-7H9.6a13 13 0 0 1-1.2-5h6.2a13 13 0 0 1-1.2 5zm1.1 5a15 15 0 0 0 1.3-5h3.2a8.1 8.1 0 0 1-4.5 5z"/></svg>`,
  };
  return (
    icons[key] ||
    `<svg ${common}><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path fill="currentColor" d="M11 7h2v6h-2zm0 8h2v2h-2z"/></svg>`
  );
}

/**
 * @param {object|null|undefined} channels
 */
function renderChannelsPanel(channels) {
  const refreshBtn = `<button type="button" class="ghost check-again-btn" data-recheck="channels-regen">Refresh</button>`;

  if (!channels) {
    return `<div class="card channels-panel">
      <div class="panel-title-row">
        <h3 class="panel-title">Channels</h3>
        ${refreshBtn}
      </div>
      <p class="muted">No channel data in this report yet. Refresh to scan the live site for socials, Google Business, shop, and websites.</p>
    </div>`;
  }

  if (!channels.ok) {
    return `<div class="card channels-panel">
      <div class="panel-title-row">
        <h3 class="panel-title">Channels</h3>
        ${refreshBtn}
      </div>
      <div class="issues-box">
        <strong>Unavailable</strong>
        <p class="muted" style="margin:0.4rem 0 0;color:inherit;">${escapeHtml(channels.error || 'Channel detection failed.')}</p>
      </div>
    </div>`;
  }

  const list = Array.isArray(channels.channels) ? channels.channels : [];
  /** @type {Record<string, string>} */
  const labels = {
    social: 'Socials',
    google_business: 'Google Business',
    website: 'Websites',
    shop: 'Shop',
    video: 'Video',
    messaging: 'Messaging',
    other: 'Other',
    individual_social: 'Individual Socials',
  };
  const order = [
    'social',
    'google_business',
    'website',
    'shop',
    'video',
    'messaging',
    'other',
    'individual_social',
  ];

  /**
   * @param {object} entry
   */
  function sourceHint(entry) {
    const sources = Array.isArray(entry.sources) ? entry.sources : [];
    if (!sources.length) return '';
    const first = sources[0];
    let pathLabel = '';
    try {
      const u = new URL(first.pageUrl);
      pathLabel = u.pathname === '/' ? 'homepage' : u.pathname;
    } catch {
      pathLabel = first.pageUrl || '';
    }
    if (first.type === 'sameAs') return `JSON-LD sameAs${pathLabel ? ` · ${pathLabel}` : ''}`;
    if (first.type === 'meta') return `meta${pathLabel ? ` · ${pathLabel}` : ''}`;
    if (first.type === 'signal') return 'site signal';
    return pathLabel ? `found on ${pathLabel}` : 'link';
  }

  /**
   * @param {object} entry
   */
  function displayLabel(entry) {
    if (entry.label) return String(entry.label);
    if (entry.category === 'individual_social') {
      return `LinkedIn - ${entry.personName || 'Profile'}`;
    }
    if (entry.category === 'social' || entry.accountType === 'company') {
      return `${entry.platform || 'Channel'} - Company page`;
    }
    return entry.platform || 'Channel';
  }

  /** @type {string[]} */
  const groups = [];
  for (const cat of order) {
    const items = list.filter((c) => c.category === cat);
    if (!items.length) continue;
    const rows = items
      .map((entry) => {
        const name = displayLabel(entry);
        const hint = sourceHint(entry);
        const titleAttr = hint ? ` title="${escapeHtml(hint)}"` : '';
        return `<li class="channels-row"${titleAttr}>
          <div class="channels-row-identity">
            <span class="channels-logo" aria-hidden="true">${channelLogoSvg(entry.platform || name)}</span>
            <span class="channels-platform">${escapeHtml(name)}</span>
          </div>
          <a class="ghost channels-visit" href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer">Visit</a>
        </li>`;
      })
      .join('');
    groups.push(`<section class="channels-group">
      <h4 class="channels-group-title">${escapeHtml(labels[cat] || cat)}</h4>
      <ul class="channels-list">${rows}</ul>
    </section>`);
  }

  const body =
    groups.length > 0
      ? groups.join('')
      : `<p class="muted">No channels detected on crawled pages.</p>`;

  return `<div class="card channels-panel">
      <div class="panel-title-row">
        <h3 class="panel-title">Channels</h3>
        ${refreshBtn}
      </div>
      <p class="muted">Presence detected from crawl links, JSON-LD <code>sameAs</code>, and meta — not a live social API.</p>
      <div class="channels-groups">${body}</div>
    </div>`;
}

/**
 * @param {object|null|undefined} general
 * @param {'business'|'tech'|null|undefined} _reportAudience
 */
function renderGeneralPanel(general, _reportAudience) {
  if (!general) {
    return renderGenerateFrame('general', 'General');
  }

  if (!general.ok) {
    return `<div class="card">
      <div class="panel-title-row">
        <h3 class="panel-title">General</h3>
        <button type="button" class="ghost check-again-btn" data-recheck="general-regen">Regenerate</button>
      </div>
      <div class="issues-box">
        <strong>Unavailable</strong>
        <p class="muted" style="margin:0.4rem 0 0;color:inherit;">${escapeHtml(general.error || 'Gemini general overview failed.')}</p>
      </div>
    </div>`;
  }

  /**
   * @param {{ key: string, label: string, fullWidth?: boolean }} def
   */
  function renderField(def) {
    const value = general[def.key] != null ? String(general[def.key]) : '';
    const rows = Math.min(10, Math.max(3, value.split('\n').length + 1));
    const spanClass = def.fullWidth ? ' general-field--full' : '';
    return `<div class="card general-block general-field${spanClass}">
      <label class="general-field-label" for="general-field-${escapeHtml(def.key)}">${escapeHtml(def.label)}</label>
      <textarea
        id="general-field-${escapeHtml(def.key)}"
        class="general-field-input"
        data-general-field="${escapeHtml(def.key)}"
        rows="${rows}"
        spellcheck="true"
      >${escapeHtml(value)}</textarea>
    </div>`;
  }

  return `<div class="stack general-stack">
      <div class="panel-title-row" style="margin:0;">
        <p class="muted" style="margin:0;">Vul aan of pas aan — leeg = niet gevonden op de site${general.model ? ` · ${escapeHtml(general.model)}` : ''}.</p>
        <button type="button" class="ghost check-again-btn" data-recheck="general-regen">Regenerate</button>
      </div>
      <div class="card-grid general-grid">
        ${GENERAL_FIELD_DEFS.map(renderField).join('')}
      </div>
    </div>`;
}

/**
 * @param {object} report
 * @param {{ fromFile?: boolean, preserveUi?: boolean, statusText?: string }} [opts]
 */
function showReport(report, opts = {}) {
  persistGeneralFieldsFromDom();
  const uiState = opts.preserveUi ? captureUiState() : null;
  normalizeReportQuickscan(report);
  if (report.general) report.general = normalizeGeneralSection(report.general) || report.general;
  report.insights = normalizeInsights(report.insights);
  lastReport = report;
  lastAnalyzedUrl = String(report.startUrl || '').trim();
  if (lastAnalyzedUrl && urlInput.value.trim() !== lastAnalyzedUrl) {
    urlInput.value = lastAnalyzedUrl;
  }
  showView('workspace');
  renderReport(report);
  const reportModel = normalizeInsights(report.insights).aiInsights?.model;
  if (reportModel) setSelectedAiModel(String(reportModel));
  setCompanyTitle(companyTitleForReport(report));
  if (uiState) restoreUiState(uiState);
  if (opts.statusText) {
    setStatus(opts.statusText);
  } else if (opts.fromFile) {
    const when = report.analyzedAt ? ` · analyzed ${String(report.analyzedAt)}` : '';
    const generalNote = report.general?.ok
      ? ' · includes General'
      : report.general
        ? ' · General unavailable'
        : ' · no General section';
    setStatus(`Loaded report${when}${generalNote}`);
  }
}

/**
 * @param {object|null|undefined} insights
 * @param {object|null|undefined} [report]
 */
function renderInsightsPanel(insights, report = null) {
  const { savedNotes, aiInsights } = normalizeInsights(insights);
  const signals = resolveReportSignals(report || lastReport);
  const metaLabel = aiInsights.generatedAt
    ? `Generated ${formatSavedNoteTime(aiInsights.generatedAt)}${aiInsights.model ? ` · ${aiInsights.model}` : ''}`
    : '';
  return `
    <div class="insights-page">
      <div class="insights-split">
        <section class="card insights-col-ai">
          <div class="insights-ai-head">
            <h3 class="panel-title">AI insights</h3>
            <div class="insights-ai-actions">
              ${renderAiModelSelect(aiInsights.model || storedAiModel())}
              <button type="button" class="generate-btn" id="insightsGenerate">Generate</button>
            </div>
          </div>
          <p class="ai-insights-meta muted" data-ai-insights-meta ${metaLabel ? '' : 'hidden'}>${escapeHtml(metaLabel)}</p>
          <div class="ai-insights-list" data-ai-insights-list>${renderAiInsightsList(aiInsights)}</div>
        </section>
        <aside class="insights-col-notes" aria-label="Eigen notities">
          ${renderSignalsLabels(signals)}
          <div class="insights-notes-chat">
            <div class="insights-notes-chat-head">
              <h3 class="panel-title">Eigen notities</h3>
              <p class="muted insights-notes-chat-hint">Observaties tijdens het gesprek — éénrichtingsverkeer, niet meegenomen in AI insights</p>
            </div>
            <div class="insights-notes-composer">
              <div class="notes-toolbar" role="toolbar" aria-label="Notes formatting">
                <button type="button" class="notes-tool" data-notes-cmd="bold" title="Bold" aria-label="Bold"><strong>B</strong></button>
                <button type="button" class="notes-tool" data-notes-cmd="italic" title="Italic" aria-label="Italic"><em>I</em></button>
                <span class="notes-tool-sep" aria-hidden="true"></span>
                <button type="button" class="notes-tool" data-notes-cmd="heading" title="Heading" aria-label="Heading">H</button>
                <button type="button" class="notes-tool" data-notes-cmd="bulletList" title="Bullet list" aria-label="Bullet list">••</button>
                <button type="button" class="notes-tool" data-notes-cmd="orderedList" title="Numbered list" aria-label="Numbered list">1.</button>
              </div>
              <div class="notes-editor notes-editor--chat">
                <div class="notes-editor-mount" data-notes-editor></div>
              </div>
              <div class="insights-notes-composer-actions">
                <button type="button" class="notes-save-btn" id="notesSaveBtn" title="Save note">Opslaan</button>
              </div>
            </div>
            <div class="insights-notes-thread saved-notes-list" data-saved-notes-list>${renderSavedNotesList(savedNotes)}</div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

/**
 * @typedef {{ metaScore: number|null, jsonLdScore: number|null, sitemap: boolean, tracking: boolean, robots: boolean, llms: boolean }} SiteSignalsView
 */

/**
 * @param {object|null|undefined} report
 * @returns {SiteSignalsView}
 */
function resolveReportSignals(report) {
  if (report?.signals && typeof report.signals === 'object') {
    const s = report.signals;
    return {
      metaScore: numberOrNull(s.metaScore),
      jsonLdScore: numberOrNull(s.jsonLdScore),
      sitemap: Boolean(s.sitemap),
      tracking: Boolean(s.tracking),
      robots: Boolean(s.robots),
      llms: Boolean(s.llms),
    };
  }

  const pages = Array.isArray(report?.pages) ? report.pages : [];
  const metaScores = pages
    .map((p) => scorePageMetaClient(p?.meta))
    .filter((n) => typeof n === 'number');
  const metaScore = metaScores.length
    ? Math.round(metaScores.reduce((a, b) => a + b, 0) / metaScores.length)
    : null;
  const jsonLdScore = numberOrNull(report?.summary?.avgScore);
  return {
    metaScore,
    jsonLdScore,
    sitemap: false,
    tracking: false,
    robots: false,
    llms: Boolean(report?.llms?.found),
  };
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
}

/**
 * @param {object|null|undefined} meta
 * @returns {number|null}
 */
function scorePageMetaClient(meta) {
  if (!meta || typeof meta !== 'object') return null;
  let earned = 0;
  let possible = 0;
  const check = (value, weight) => {
    possible += weight;
    if (String(value || '').trim()) earned += weight;
  };
  check(meta.title, 28);
  check(meta.description, 28);
  check(meta.canonical, 12);
  check(meta.ogTitle || meta.title, 12);
  check(meta.ogDescription || meta.description, 10);
  check(meta.ogImage, 10);
  if (!possible) return null;
  return Math.round((earned / possible) * 100);
}

/**
 * Compact value-only labels above notes.
 * @param {SiteSignalsView} signals
 */
function renderSignalsLabels(signals) {
  const score = (n) => (n == null ? '—' : String(n));
  const yn = (v) => (v ? 'Ja' : 'Nee');
  const items = [
    {
      key: 'meta',
      label: 'Meta data score',
      value: score(signals.metaScore),
      tone: scoreToneClass(signals.metaScore),
      tip: 'Gemiddelde compleetheid van HTML-meta op de gecrawlde pagina’s: title (28), description (28), canonical (12), og:title (12), og:description (10), og:image (10). Alleen aanwezigheid, geen ranking.',
    },
    {
      key: 'sitemap',
      label: 'Sitemap aanwezig',
      value: yn(signals.sitemap),
      tone: signals.sitemap ? 'ok' : 'miss',
      tip: 'Of er tijdens de crawl een bereikbare XML-sitemap is gevonden (via robots.txt of /sitemap.xml).',
    },
    {
      key: 'tracking',
      label: 'Tracking aanwezig',
      value: yn(signals.tracking),
      tone: signals.tracking ? 'ok' : 'miss',
      tip: 'Of op de homepage bekende tracking-scripts zijn gedetecteerd (o.a. Google Analytics/GTM, Meta Pixel, Hotjar, Clarity).',
    },
    {
      key: 'robots',
      label: 'Robots aanwezig',
      value: yn(signals.robots),
      tone: signals.robots ? 'ok' : 'miss',
      tip: 'Of /robots.txt bereikbaar is op de website.',
    },
    {
      key: 'llms',
      label: 'llms.txt aanwezig',
      value: yn(signals.llms),
      tone: signals.llms ? 'ok' : 'miss',
      tip: 'Of /llms.txt aanwezig is — een bestand dat AI-agents helpt om de site te begrijpen.',
    },
    {
      key: 'jsonld',
      label: 'JSON-LD Score',
      value: score(signals.jsonLdScore),
      tone: scoreToneClass(signals.jsonLdScore),
      tip: 'Gemiddelde JSON-LD-kwaliteitsscore (0–100) over de gecrawlde pagina’s: types, verplichte/aanbevolen velden en basisconsistentie met HTML-meta.',
    },
  ];

  return `<div class="signals-labels" aria-label="Site signalen">
    ${items
      .map(
        (item) => `<div class="signals-label signals-label--${escapeHtml(item.tone)}" data-signal="${escapeHtml(item.key)}">
      <span class="signals-label-head">
        <span class="signals-label-name">${escapeHtml(item.label)}</span>
        <button type="button" class="signals-info" aria-label="Info: ${escapeHtml(item.label)}" data-tip="${escapeHtml(item.tip)}">
          <span aria-hidden="true">i</span>
        </button>
      </span>
      <span class="signals-label-value">${escapeHtml(item.value)}</span>
    </div>`
      )
      .join('')}
  </div>`;
}

/**
 * @param {number|null} score
 */
function scoreToneClass(score) {
  if (score == null) return 'empty';
  if (score >= 70) return 'ok';
  if (score < 50) return 'miss';
  return 'mid';
}

/**
 * Persist TipTap HTML into the current report.
 * @param {string} html
 */
function persistNotesHtml(html) {
  if (!lastReport) return;
  const empty = !html || html === '<p></p>';
  lastReport.insights = {
    ...normalizeInsights(lastReport.insights),
    notesHtml: empty ? '' : html,
  };
}

/**
 * Sync toolbar active states with TipTap selection.
 */
function syncNotesToolbar() {
  if (!notesEditor || !resultsEl) return;
  /** @type {Record<string, boolean>} */
  const map = {
    bold: notesEditor.isActive('bold'),
    italic: notesEditor.isActive('italic'),
    heading: notesEditor.isActive('heading', { level: 2 }),
    bulletList: notesEditor.isActive('bulletList'),
    orderedList: notesEditor.isActive('orderedList'),
  };
  resultsEl.querySelectorAll('[data-notes-cmd]').forEach((btn) => {
    const cmd = btn.getAttribute('data-notes-cmd') || '';
    if (cmd in map) btn.classList.toggle('is-active', Boolean(map[cmd]));
  });
}

/**
 * Mount TipTap into the Notes column (clean, document-style editor).
 * Uses a local esbuild bundle so all extensions share one prosemirror-model.
 */
async function mountNotesEditor() {
  destroyNotesEditor();
  const host = /** @type {HTMLElement|null} */ (resultsEl.querySelector('[data-notes-editor]'));
  if (!host) return;

  const initialHtml = normalizeInsights(lastReport?.insights).notesHtml;

  try {
    const mod = await import('/vendor/tiptap.js');
    const Editor = mod.Editor;
    const StarterKit = mod.StarterKit;
    const Placeholder = mod.Placeholder;
    if (!Editor || !StarterKit || !Placeholder) {
      throw new Error('TipTap bundle did not load correctly');
    }

    if (!resultsEl.contains(host)) return;

    notesEditor = new Editor({
      element: host,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2] },
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
          code: false,
          bulletList: {
            HTMLAttributes: { class: 'notes-bullet-list' },
          },
          orderedList: {
            HTMLAttributes: { class: 'notes-ordered-list' },
          },
        }),
        Placeholder.configure({
          placeholder: 'Eigen observaties, quotes van de klant, afspraken…',
        }),
      ],
      content: initialHtml || '',
      editorProps: {
        attributes: {
          class: 'notes-prose',
          'aria-label': 'Notes',
        },
      },
      onUpdate: ({ editor }) => {
        persistNotesHtml(editor.getHTML());
      },
      onSelectionUpdate: () => {
        syncNotesToolbar();
      },
      onTransaction: () => {
        syncNotesToolbar();
      },
    });

    resultsEl.querySelectorAll('[data-notes-cmd]').forEach((btn) => {
      btn.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      btn.addEventListener('click', () => {
        if (!notesEditor) return;
        const cmd = btn.getAttribute('data-notes-cmd');
        const chain = notesEditor.chain().focus();
        if (cmd === 'bold') chain.toggleBold().run();
        else if (cmd === 'italic') chain.toggleItalic().run();
        else if (cmd === 'heading') chain.toggleHeading({ level: 2 }).run();
        else if (cmd === 'bulletList') chain.toggleBulletList().run();
        else if (cmd === 'orderedList') chain.toggleOrderedList().run();
        syncNotesToolbar();
      });
    });

    const saveBtn = resultsEl.querySelector('#notesSaveBtn');
    saveBtn?.addEventListener('click', () => {
      const wasEdit = Boolean(editingSavedNoteId);
      const saved = saveCurrentNote();
      if (!saved) {
        setStatus('Niets om op te slaan — schrijf eerst een notitie.', true);
        return;
      }
      if (notesEditor) {
        notesEditor.commands.setContent('', false);
        persistNotesHtml('');
      }
      setStatus(wasEdit ? 'Notitie bijgewerkt.' : 'Notitie opgeslagen.', false);
    });

    syncNotesSaveButtonLabel();
    bindSavedNotesActions();
    syncNotesToolbar();
  } catch (err) {
    console.error(err);
    host.innerHTML = `<p class="muted">Notes editor failed to load.</p>`;
  }
}

/**
 * @param {object} report
 */
function renderReport(report) {
  destroyNotesEditor();
  const analyzedLabel = report.analyzedAt
    ? `Analyzed ${escapeHtml(String(report.analyzedAt).replace('T', ' ').replace(/\.\d+Z$/, ' UTC'))}`
    : 'Current analysis';
  const startLabel = report.startUrl ? escapeHtml(String(report.startUrl)) : '';
  const nameLabel = escapeHtml(companyTitleForReport(report));
  const { clientVerslag, aiInsights } = normalizeInsights(report.insights);
  const verslagMeta = clientVerslag.ok && clientVerslag.generatedAt
    ? `Laatste verslag: ${formatSavedNoteTime(clientVerslag.generatedAt)}`
    : '';
  const canMakePdf = Boolean(aiInsights.ok && aiInsights.cards.length);

  resultsEl.removeAttribute('aria-busy');
  resultsEl.innerHTML = `
    <div class="card results-toolbar">
      <div class="results-toolbar-meta">
        <h1 id="companyTitle" class="company-title results-toolbar-name">${nameLabel}</h1>
        ${startLabel ? `<div class="results-toolbar-url">${startLabel}</div>` : ''}
        <div class="results-toolbar-time">${analyzedLabel}</div>
      </div>
      <div class="results-toolbar-actions">
        <button type="button" class="btn-primary" id="downloadReport">Save to local file</button>
        <div class="results-toolbar-actions-row">
          <button type="button" class="ghost" id="newAnalysis">New analysis</button>
          <label class="ghost file-label">
            Open from local file
            <input id="openReport" type="file" accept="application/json,.json" hidden />
          </label>
        </div>
      </div>
    </div>
    <div class="results-section">
      <div class="tabs-bar">
        <div class="tabs" role="tablist" aria-label="Analysis results">
          <button type="button" class="tab is-active" role="tab" aria-selected="true" data-tab="general">General</button>
          <button type="button" class="tab" role="tab" aria-selected="false" data-tab="channels">Channels</button>
          <button type="button" class="tab" role="tab" aria-selected="false" data-tab="insights">Insights</button>
        </div>
        <div class="tabs-actions">
          <p class="muted tabs-verslag-meta" data-verslag-pdf-meta ${verslagMeta ? '' : 'hidden'}>${escapeHtml(verslagMeta)}</p>
          <button type="button" class="ghost tabs-verslag-redownload" id="insightsVerslagRedownload" ${clientVerslag.ok ? '' : 'hidden'}>Verslag opnieuw</button>
          <button type="button" class="btn-primary insights-verslag-btn" id="insightsVerslag" ${canMakePdf ? '' : 'disabled'} title="${canMakePdf ? 'Verslag openen om af te drukken of op te slaan' : 'Genereer eerst AI insights'}">Verslag</button>
        </div>
      </div>
      <div class="tab-panels">
        <div class="tab-panel is-active" data-panel="general" role="tabpanel">${renderGeneralPanel(report.general, report.audience)}</div>
        <div class="tab-panel" data-panel="channels" role="tabpanel" hidden>${renderChannelsPanel(report.channels)}</div>
        <div class="tab-panel" data-panel="insights" role="tabpanel" hidden>${renderInsightsPanel(report.insights, report)}</div>
      </div>
    </div>
  `;

  resultsEl.hidden = false;

  resultsEl.querySelector('#downloadReport')?.addEventListener('click', () => {
    if (notesEditor) persistNotesHtml(notesEditor.getHTML());
    persistGeneralFieldsFromDom();
    if (lastReport) downloadReport(lastReport);
  });

  resultsEl.querySelector('#newAnalysis')?.addEventListener('click', () => {
    showView('landing');
    setStatus('', false);
    urlInput.focus();
  });

  const openInput = /** @type {HTMLInputElement|null} */ (resultsEl.querySelector('#openReport'));
  openInput?.addEventListener('change', () => {
    const file = openInput.files?.[0];
    openInput.value = '';
    if (file) void handleOpenReport(file);
  });

  resultsEl.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const id = tab.getAttribute('data-tab');
      resultsEl.querySelectorAll('.tab').forEach((t) => {
        const on = t === tab;
        t.classList.toggle('is-active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      resultsEl.querySelectorAll('.tab-panel').forEach((panel) => {
        const on = panel.getAttribute('data-panel') === id;
        panel.classList.toggle('is-active', on);
        panel.hidden = !on;
      });
    });
  });

  resultsEl.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const pre = btn.closest('div')?.querySelector('pre.copy-source');
      const text = pre?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1500);
      } catch {
        btn.textContent = 'Failed';
      }
    });
  });

  resultsEl.querySelectorAll('[data-qs-root]').forEach((root) => {
    const qsFilters = root.querySelectorAll('.qs-filter');
    const qsBoxes = root.querySelectorAll('[data-qs-box]');
    qsFilters.forEach((btn) => {
      btn.addEventListener('click', () => {
        const filter = btn.getAttribute('data-qs-filter') || 'all';
        qsFilters.forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        qsBoxes.forEach((box) => {
          const kind = box.getAttribute('data-qs-box');
          box.hidden = filter !== 'all' && filter !== kind;
        });
      });
    });
  });

  bindRecheckButtons();
  bindViewAudienceControls();
  bindGeneralFieldEditors();
  bindInsightsGenerate();
  bindInsightsModelSelect();
  bindInsightsVerslag();
  syncVerslagPdfMeta();
  void mountNotesEditor();
}

/**
 * Keep editable General intake fields synced into lastReport.
 */
function bindGeneralFieldEditors() {
  resultsEl.querySelectorAll('textarea[data-general-field]').forEach((node) => {
    const el = /** @type {HTMLTextAreaElement} */ (node);
    const sync = () => {
      if (!lastReport?.general || lastReport.general.ok === false) return;
      const key = el.getAttribute('data-general-field');
      if (!key) return;
      lastReport.general = { ...lastReport.general, [key]: el.value };
    };
    el.addEventListener('input', sync);
    el.addEventListener('change', sync);
  });
}

/**
 * Wire the AI insights Generate button.
 */
function bindInsightsGenerate() {
  const btn = resultsEl.querySelector('#insightsGenerate');
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener('click', () => {
    void generateAiInsightsItem(btn);
  });
}

function bindInsightsVerslag() {
  const btn = resultsEl.querySelector('#insightsVerslag');
  if (btn instanceof HTMLButtonElement) {
    btn.addEventListener('click', () => {
      void generateClientVerslagItem(btn);
    });
  }
  const redownload = resultsEl.querySelector('#insightsVerslagRedownload');
  if (redownload instanceof HTMLButtonElement) {
    redownload.addEventListener('click', () => {
      void redownloadClientVerslagPdf(redownload);
    });
  }
}

function bindViewAudienceControls() {
  resultsEl.querySelectorAll('select.view-audience').forEach((node) => {
    const select = /** @type {HTMLSelectElement} */ (node);
    select.addEventListener('change', () => {
      if (!lastReport) return;
      const role = select.value === 'tech' ? 'tech' : 'business';
      const next = { ...lastReport, audience: role };
      showReport(next, { preserveUi: true, statusText: `Showing ${role === 'tech' ? 'Tech expert' : 'Business developer'} wording` });
    });
  });
}

/**
 * @param {HTMLButtonElement} btn
 * @param {boolean} busy
 * @param {string} [busyLabel]
 */
function setButtonBusy(btn, busy, busyLabel = 'Checking…') {
  if (busy) {
    btn.dataset.label = btn.textContent || 'Check again';
    btn.textContent = busyLabel;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.label || 'Check again';
    btn.disabled = false;
    delete btn.dataset.label;
  }
}

function bindRecheckButtons() {
  resultsEl.querySelectorAll('.check-again-btn').forEach((node) => {
    const btn = /** @type {HTMLButtonElement} */ (node);
    btn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const kind = btn.getAttribute('data-recheck');
      if (kind === 'page') void recheckPageItem(btn);
      else if (kind === 'llms') void recheckLlmsItem(btn);
      else if (kind === 'quickscan' || kind === 'contentQuickscan') void recheckQuickscanItem(btn);
      else if (kind === 'general' || kind === 'general-regen') void recheckGeneralItem(btn);
      else if (kind === 'quickscan-regen') void recheckQuickscanSection(btn);
      else if (kind === 'contentQuickscan-regen') void recheckContentQuickscanSection(btn);
      else if (kind === 'channels-regen') void recheckChannelsSection(btn);
    });
  });
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckPageItem(btn) {
  if (!lastReport) return;
  const index = Number(btn.getAttribute('data-page-index'));
  const page = lastReport.pages?.[index];
  if (!page?.url) {
    setStatus('Error: page not found in report');
    return;
  }

  setButtonBusy(btn, true);
  setStatus(`Re-checking ${page.url}…`);
  try {
    const res = await fetch('/api/recheck/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: page.url }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const pages = [...(lastReport.pages || [])];
    pages[index] = data.page;
    const next = {
      ...lastReport,
      pages,
      summary: summarizePages(pages),
    };
    const scoreLabel = data.page.score == null ? 'n/a' : data.page.score;
    showReport(next, {
      preserveUi: true,
      statusText: `Updated ${data.page.url} — score ${scoreLabel}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckLlmsItem(btn) {
  if (!lastReport) return;
  const url = lastReport.startUrl || lastReport.llms?.url || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for llms.txt recheck');
    return;
  }

  setButtonBusy(btn, true);
  setStatus('Re-checking llms.txt…');
  try {
    const res = await fetch('/api/recheck/llms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const next = { ...lastReport, llms: data.llms };
    const scoreLabel = data.llms?.score == null && data.llms?.found ? 'n/a' : data.llms?.score ?? 0;
    const found = data.llms?.found ? 'found' : 'missing';
    showReport(next, {
      preserveUi: true,
      statusText: `Updated llms.txt (${found}) — score ${scoreLabel}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckQuickscanItem(btn) {
  const section = btn.getAttribute('data-recheck') === 'contentQuickscan' ? 'contentQuickscan' : 'quickscan';
  if (!lastReport?.[section]) return;
  const kind = btn.getAttribute('data-qs-kind') === 'wins' ? 'wins' : 'issues';
  const index = Number(btn.getAttribute('data-qs-index'));
  const listKey = kind === 'wins' ? 'quickWins' : 'issues';
  normalizeReportQuickscan(lastReport);
  const list = [...(lastReport[section][listKey] || [])].map(normalizeQsItem);
  const item = list[index];
  if (!item || !(item.business || item.tech)) {
    setStatus(`Error: ${section === 'contentQuickscan' ? 'content' : 'tech'} quickscan item not found`);
    return;
  }

  const siteUrl = lastReport.startUrl || urlInput.value.trim();
  if (!siteUrl) {
    setStatus('Error: no site URL available for quickscan confirmation');
    return;
  }

  const role = lastReport.audience === 'tech' ? 'tech' : 'business';
  const itemText =
    `Business: ${item.business || item.tech}\nTech: ${item.tech || item.business}`.trim();
  const endpoint =
    section === 'contentQuickscan' ? '/api/recheck/content-quickscan-item' : '/api/recheck/quickscan-item';

  setButtonBusy(btn, true);
  setStatus(`Confirming ${kind === 'wins' ? 'improvement' : 'issue'} on live site…`);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ siteUrl, item: itemText, kind, model: selectedAiModel() }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || data.note || `HTTP ${res.status}`);

    list[index] = {
      ...item,
      text: textForRole(item, role),
      status: data.fixed ? 'fixed' : 'open_still',
      note: data.note || (data.fixed ? 'Bevestigd als opgelost op de live site.' : 'Nog aanwezig op de live site.'),
      checkedAt: new Date().toISOString(),
    };

    const next = {
      ...lastReport,
      [section]: {
        ...lastReport[section],
        [listKey]: list,
      },
    };
    showReport(next, {
      preserveUi: true,
      statusText: data.fixed
        ? 'Marked as fixed — Gemini confirmed it on the live site.'
        : 'Still an issue — Gemini could not confirm a fix yet.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * Shared light page payload for Gemini rechecks.
 * @param {number} [limit]
 */
function lightPagesPayload(limit = 25) {
  return (lastReport?.pages || []).slice(0, limit).map((p) => ({
    url: p.url,
    score: p.score,
    types: p.types || [],
    meta: p.meta
      ? {
          title: p.meta.title || '',
          description: p.meta.description || '',
          siteName: p.meta.siteName || '',
          ogTitle: p.meta.ogTitle || '',
        }
      : undefined,
    jsonLd: Array.isArray(p.jsonLd) ? p.jsonLd.slice(0, 5) : [],
    issues: Array.isArray(p.issues) ? p.issues.slice(0, 3) : [],
    fetchError: p.fetchError || null,
  }));
}

/**
 * @param {HTMLButtonElement} btn
 */
async function generateAiInsightsItem(btn) {
  if (!lastReport) return;
  const url = lastReport.startUrl || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for AI insights');
    return;
  }

  if (notesEditor) persistNotesHtml(notesEditor.getHTML());

  setButtonBusy(btn, true, 'Generating…');
  setStatus('Generating AI insights…');
  try {
    const res = await fetch('/api/recheck/ai-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        model: selectedAiModel(),
        pages: lightPagesPayload(),
        summary: lastReport.summary,
        llms: lastReport.llms
          ? { found: Boolean(lastReport.llms.found), score: lastReport.llms.score }
          : undefined,
        general: lastReport.general ?? null,
        channels: lastReport.channels ?? null,
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const aiInsights = normalizeAiInsights(data.aiInsights);
    lastReport.insights = {
      ...normalizeInsights(lastReport.insights),
      aiInsights,
    };
    refreshAiInsightsUi();
    if (aiInsights.ok) {
      setStatus('', false);
    } else {
      setStatus(`AI insights: ${aiInsights.error || 'no findings'}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
  } finally {
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function generateClientVerslagItem(btn) {
  if (!lastReport) return;
  if (!hasGeneratedAiInsights(lastReport.insights)) {
    setStatus('Genereer eerst AI insights voordat u een verslag maakt.');
    return;
  }
  const url = lastReport.startUrl || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for verslag');
    return;
  }

  if (notesEditor) persistNotesHtml(notesEditor.getHTML());
  const insights = normalizeInsights(lastReport.insights);

  setButtonBusy(btn, true, 'Bezig…');
  setStatus('Verslag wordt samengesteld…');
  try {
    const res = await fetch('/api/recheck/client-verslag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        model: selectedAiModel(),
        general: lastReport.general ?? null,
        aiInsights: insights.aiInsights,
        notesHtml: insights.notesHtml,
        savedNotes: insights.savedNotes,
        channels: lastReport.channels ?? null,
        signals: resolveReportSignals(lastReport),
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) {
      throw new Error(data.error || data.clientVerslag?.error || `HTTP ${res.status}`);
    }

    const clientVerslag = normalizeClientVerslag(data.clientVerslag);
    lastReport.insights = {
      ...insights,
      clientVerslag,
    };
    if (typeof data.html === 'string' && data.html.trim()) {
      openVerslagPrintPage(data.html);
    }
    syncVerslagPdfMeta();
    setStatus(clientVerslag.ok ? 'Verslag geopend in nieuw tabblad.' : `Verslag: ${clientVerslag.error || 'mislukt'}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
  } finally {
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function redownloadClientVerslagPdf(btn) {
  if (!lastReport) return;
  const url = lastReport.startUrl || urlInput.value.trim();
  const insights = normalizeInsights(lastReport.insights);
  if (!insights.clientVerslag.ok) {
    setStatus('Nog geen opgeslagen verslag — gebruik Verslag.');
    return;
  }

  setButtonBusy(btn, true, 'Openen…');
  try {
    const res = await fetch('/api/client-verslag/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        general: lastReport.general ?? null,
        clientVerslag: insights.clientVerslag,
        signals: resolveReportSignals(lastReport),
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (typeof data.html === 'string' && data.html.trim()) {
      openVerslagPrintPage(data.html);
    }
    setStatus('Verslag opnieuw geopend.');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
  } finally {
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckGeneralItem(btn) {
  if (!lastReport) return;
  persistGeneralFieldsFromDom();
  const preservedRawData =
    lastReport.general?.ok && lastReport.general.rawData != null ? String(lastReport.general.rawData) : '';
  const url = lastReport.startUrl || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for general overview');
    return;
  }

  setButtonBusy(btn, true, 'Generating…');
  setStatus('Generating general overview…');
  try {
    const res = await fetch('/api/recheck/general', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        model: selectedAiModel(),
        pages: lightPagesPayload(),
        summary: lastReport.summary,
        llms: lastReport.llms
          ? { found: Boolean(lastReport.llms.found), score: lastReport.llms.score }
          : undefined,
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    let general = data.general;
    if (general?.ok && preservedRawData.trim()) {
      general = { ...general, rawData: preservedRawData };
    }
    const next = { ...lastReport, general, aiModel: selectedAiModel() };
    showReport(next, {
      preserveUi: true,
      statusText: data.general?.ok
        ? 'General overview updated.'
        : `General overview failed: ${data.general?.error || 'unknown error'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckQuickscanSection(btn) {
  if (!lastReport) return;
  const url = lastReport.startUrl || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for quickscan');
    return;
  }

  setButtonBusy(btn, true, 'Generating…');
  setStatus('Generating tech quickscan…');
  try {
    const res = await fetch('/api/recheck/quickscan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        model: selectedAiModel(),
        pages: lightPagesPayload(),
        summary: lastReport.summary,
        llms: lastReport.llms
          ? { found: Boolean(lastReport.llms.found), score: lastReport.llms.score }
          : undefined,
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const next = { ...lastReport, quickscan: data.quickscan, aiModel: selectedAiModel() };
    showReport(next, {
      preserveUi: true,
      statusText: data.quickscan?.ok
        ? 'Tech Quickscan updated.'
        : `Tech Quickscan failed: ${data.quickscan?.error || 'unknown error'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckContentQuickscanSection(btn) {
  if (!lastReport) return;
  const url = lastReport.startUrl || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for content quickscan');
    return;
  }

  setButtonBusy(btn, true, 'Generating…');
  setStatus('Generating content quickscan…');
  try {
    const res = await fetch('/api/recheck/content-quickscan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        model: selectedAiModel(),
        pages: lightPagesPayload(40),
        summary: lastReport.summary,
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const next = { ...lastReport, contentQuickscan: data.contentQuickscan, aiModel: selectedAiModel() };
    showReport(next, {
      preserveUi: true,
      statusText: data.contentQuickscan?.ok
        ? 'Content Quickscan updated.'
        : `Content Quickscan failed: ${data.contentQuickscan?.error || 'unknown error'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * @param {HTMLButtonElement} btn
 */
async function recheckChannelsSection(btn) {
  if (!lastReport) return;
  const url = lastReport.startUrl || urlInput.value.trim();
  if (!url) {
    setStatus('Error: no site URL available for channels');
    return;
  }

  setButtonBusy(btn, true, 'Refreshing…');
  setStatus('Refreshing channels from the live site…');
  try {
    const res = await fetch('/api/recheck/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        pages: lightPagesPayload(40),
      }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const next = { ...lastReport, channels: data.channels };
    const count = Array.isArray(data.channels?.channels) ? data.channels.channels.length : 0;
    showReport(next, {
      preserveUi: true,
      statusText: data.channels?.ok
        ? `Channels updated · ${count} found.`
        : `Channels failed: ${data.channels?.error || 'unknown error'}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    setButtonBusy(btn, false);
  }
}

/**
 * @param {File} file
 */
async function handleOpenReport(file) {
  try {
    setStatus('Loading report…');
    showView('workspace');
    renderAnalysisSkeleton();
    setCompanyTitle('Loading…');
    const report = await loadReportFile(file);
    showReport(report, { fromFile: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    resultsEl.removeAttribute('aria-busy');
    resultsEl.innerHTML = `<div class="card"><p class="muted">${escapeHtml(message)}</p><p style="margin:0.75rem 0 0;"><button type="button" class="ghost" id="backToLanding">Back to start</button></p></div>`;
    resultsEl.querySelector('#backToLanding')?.addEventListener('click', () => {
      showView('landing');
      setStatus('', false);
    });
  }
}

const openReportEmpty = /** @type {HTMLInputElement|null} */ (document.getElementById('openReportEmpty'));
openReportEmpty?.addEventListener('change', () => {
  const file = openReportEmpty.files?.[0];
  openReportEmpty.value = '';
  if (file) void handleOpenReport(file);
});

const reportDropzone = document.getElementById('reportDropzone');
if (reportDropzone) {
  let dragDepth = 0;

  /**
   * @param {DragEvent} event
   */
  function hasFiles(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  reportDropzone.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth += 1;
    reportDropzone.classList.add('empty-card--drag');
  });

  reportDropzone.addEventListener('dragover', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });

  reportDropzone.addEventListener('dragleave', (event) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) reportDropzone.classList.remove('empty-card--drag');
  });

  reportDropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    reportDropzone.classList.remove('empty-card--drag');
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleOpenReport(file);
  });
}

document.getElementById('brandHome')?.addEventListener('click', (event) => {
  event.preventDefault();
  showView('landing');
  setStatus('', false);
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const url = urlInput.value.trim();
  const maxPages = 50;

  submitBtn.disabled = true;
  clearResults();
  showView('workspace');
  setStatus('Crawling site, detecting channels, and generating general overview…');
  renderAnalysisSkeleton();
  setCompanyTitle(companyNameFromUrl(url));

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxPages }),
    });
    const data = await readApiJson(res);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    setStatus('', false);
    showReport(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatus(`Error: ${message}`);
    lastAnalyzedUrl = '';
    lastReport = null;
    resultsEl.removeAttribute('aria-busy');
    resultsEl.innerHTML = `<div class="card"><p class="muted">${escapeHtml(message)}</p><p style="margin:0.75rem 0 0;"><button type="button" class="ghost" id="backToLanding">Back to start</button></p></div>`;
    resultsEl.querySelector('#backToLanding')?.addEventListener('click', () => {
      showView('landing');
      setStatus('', false);
    });
  } finally {
    submitBtn.disabled = false;
  }
});

showView('landing');
