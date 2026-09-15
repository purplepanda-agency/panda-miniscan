/**
 * Shared Express API app (local Node + Cloudflare Workers).
 */

import express from 'express';
import { analyzeSite } from './index.js';
import {
  recheckPage,
  recheckLlms,
  confirmQuickscanItem,
  recheckGeneral,
  recheckQuickscan,
  recheckContentQuickscan,
  recheckChannels,
  recheckAiInsights,
  recheckClientVerslag,
} from './recheck.js';
import { buildClientVerslagHtml, companyNameForVerslag } from './client-verslag-print.js';
import { normalizeClientVerslag } from './client-verslag.js';
import { resolveGeminiModel } from './models.js';

/**
 * @param {unknown} body
 * @returns {string}
 */
function modelFromBody(body) {
  return resolveGeminiModel(body?.model);
}

/**
 * @param {{ jsonLimit?: string }} [options]
 */
export function createApiApp(options = {}) {
  const app = express();
  app.use(express.json({ limit: options.jsonLimit || '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'structa' });
  });

  app.post('/api/analyze', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }

    const maxPages = Math.min(100, Math.max(1, Number(req.body.maxPages) || 50));
    const concurrency = Math.min(10, Math.max(1, Number(req.body.concurrency) || 5));
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 10_000));
    const respectRobots = req.body.respectRobots !== false;
    const audience = req.body?.audience === 'tech' ? 'tech' : 'business';
    const model = modelFromBody(req.body);

    try {
      const report = await analyzeSite(url, {
        maxPages,
        concurrency,
        timeoutMs,
        respectRobots,
        audience,
        model,
        skipQuickscan: true,
        skipContentQuickscan: true,
        skipGeneral: false,
      });
      res.json(report);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/page', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 10_000));
    try {
      const page = await recheckPage(url, { timeoutMs });
      res.json({ page });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/llms', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 10_000));
    try {
      const llms = await recheckLlms(url, { timeoutMs });
      res.json({ llms });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/quickscan-item', async (req, res) => {
    const siteUrl = req.body?.siteUrl;
    const item = req.body?.item;
    if (!siteUrl || typeof siteUrl !== 'string' || !item || typeof item !== 'string') {
      res.status(400).json({ error: 'Body must include string "siteUrl" and "item"' });
      return;
    }
    const kind = req.body?.kind === 'wins' ? 'wins' : 'issues';
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 12_000));
    const model = modelFromBody(req.body);
    try {
      const result = await confirmQuickscanItem({ siteUrl, item, kind, timeoutMs, model });
      if (!result.ok) {
        res.status(502).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/general', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 12_000));
    const audience = req.body?.audience === 'tech' ? 'tech' : 'business';
    const model = modelFromBody(req.body);
    const pages = Array.isArray(req.body?.pages)
      ? req.body.pages.slice(0, 25).map((p) => ({
          url: p?.url,
          score: p?.score,
          types: p?.types || [],
          meta: p?.meta
            ? {
                title: p.meta.title || '',
                description: p.meta.description || '',
                siteName: p.meta.siteName || '',
              }
            : undefined,
          jsonLd: [],
        }))
      : [];
    try {
      const general = await recheckGeneral(url, {
        timeoutMs,
        pages,
        summary: req.body?.summary,
        audience,
        model,
        llms: req.body?.llms
          ? { found: Boolean(req.body.llms.found), score: req.body.llms.score }
          : undefined,
      });
      res.json({ general });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/quickscan', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 12_000));
    const audience = req.body?.audience === 'tech' ? 'tech' : 'business';
    const model = modelFromBody(req.body);
    const pages = Array.isArray(req.body?.pages)
      ? req.body.pages.slice(0, 25).map((p) => ({
          url: p?.url,
          score: p?.score,
          types: p?.types || [],
          meta: p?.meta
            ? {
                title: p.meta.title || '',
                description: p.meta.description || '',
                siteName: p.meta.siteName || '',
              }
            : undefined,
          jsonLd: [],
        }))
      : [];
    try {
      const quickscan = await recheckQuickscan(url, {
        timeoutMs,
        pages,
        summary: req.body?.summary,
        audience,
        model,
        llms: req.body?.llms
          ? { found: Boolean(req.body.llms.found), score: req.body.llms.score }
          : undefined,
      });
      res.json({ quickscan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/content-quickscan', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 20_000));
    const audience = req.body?.audience === 'tech' ? 'tech' : 'business';
    const model = modelFromBody(req.body);
    const pages = Array.isArray(req.body?.pages)
      ? req.body.pages.slice(0, 40).map((p) => ({
          url: p?.url,
          score: p?.score,
          types: p?.types || [],
          meta: p?.meta
            ? {
                title: p.meta.title || '',
                description: p.meta.description || '',
                siteName: p.meta.siteName || '',
              }
            : undefined,
          jsonLd: [],
        }))
      : [];
    try {
      const contentQuickscan = await recheckContentQuickscan(url, {
        timeoutMs,
        pages,
        summary: req.body?.summary,
        audience,
        model,
      });
      res.json({ contentQuickscan });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/content-quickscan-item', async (req, res) => {
    const siteUrl = req.body?.siteUrl;
    const item = req.body?.item;
    if (!siteUrl || typeof siteUrl !== 'string' || !item || typeof item !== 'string') {
      res.status(400).json({ error: 'Body must include string "siteUrl" and "item"' });
      return;
    }
    const kind = req.body?.kind === 'wins' ? 'wins' : 'issues';
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 12_000));
    const model = modelFromBody(req.body);
    try {
      const result = await confirmQuickscanItem({ siteUrl, item, kind, timeoutMs, model });
      if (!result.ok) {
        res.status(502).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/channels', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 20_000));
    const pages = Array.isArray(req.body?.pages)
      ? req.body.pages.slice(0, 40).map((p) => ({
          url: p?.url,
          score: p?.score,
          types: p?.types || [],
          meta: p?.meta
            ? {
                title: p.meta.title || '',
                description: p.meta.description || '',
                siteName: p.meta.siteName || '',
                canonical: p.meta.canonical || '',
              }
            : undefined,
          jsonLd: Array.isArray(p?.jsonLd) ? p.jsonLd.slice(0, 5) : [],
        }))
      : [];
    try {
      const channels = await recheckChannels(url, { timeoutMs, pages });
      res.json({ channels });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/ai-insights', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const timeoutMs = Math.min(60_000, Math.max(1000, Number(req.body.timeoutMs) || 25_000));
    const model = modelFromBody(req.body);
    const pages = Array.isArray(req.body?.pages)
      ? req.body.pages.slice(0, 25).map((p) => ({
          url: p?.url,
          score: p?.score,
          types: p?.types || [],
          meta: p?.meta
            ? {
                title: p.meta.title || '',
                description: p.meta.description || '',
                siteName: p.meta.siteName || '',
                ogTitle: p.meta.ogTitle || '',
              }
            : undefined,
          jsonLd: Array.isArray(p?.jsonLd) ? p.jsonLd.slice(0, 5) : [],
          issues: Array.isArray(p?.issues) ? p.issues.slice(0, 3) : [],
          fetchError: p?.fetchError || null,
        }))
      : [];
    try {
      const aiInsights = await recheckAiInsights(url, {
        timeoutMs,
        pages,
        model,
        summary: req.body?.summary,
        llms: req.body?.llms
          ? { found: Boolean(req.body.llms.found), score: req.body.llms.score }
          : undefined,
        general: req.body?.general ?? null,
        channels: req.body?.channels ?? null,
      });
      res.json({ aiInsights });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/recheck/client-verslag', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    try {
      const general = req.body?.general ?? null;
      const model = modelFromBody(req.body);
      const clientVerslag = await recheckClientVerslag(url, {
        general,
        model,
        aiInsights: req.body?.aiInsights ?? null,
        notesHtml: typeof req.body?.notesHtml === 'string' ? req.body.notesHtml : '',
        savedNotes: Array.isArray(req.body?.savedNotes) ? req.body.savedNotes : [],
        channels: req.body?.channels ?? null,
      });
      if (!clientVerslag.ok) {
        res.status(422).json({ error: clientVerslag.error || 'Verslag genereren mislukt', clientVerslag });
        return;
      }
      const html = buildClientVerslagHtml(clientVerslag, {
        url,
        companyName: companyNameForVerslag(url, general),
        generatedAt: clientVerslag.generatedAt,
        signals: req.body?.signals ?? null,
      });
      res.json({
        clientVerslag,
        html,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/client-verslag/print', async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Body must include string "url"' });
      return;
    }
    const general = req.body?.general ?? null;
    const clientVerslag = normalizeClientVerslag(req.body?.clientVerslag);
    if (!clientVerslag.ok) {
      res.status(422).json({ error: 'Geen opgeslagen verslag om te openen.' });
      return;
    }
    try {
      const html = buildClientVerslagHtml(clientVerslag, {
        url,
        companyName: companyNameForVerslag(url, general),
        generatedAt: clientVerslag.generatedAt,
        signals: req.body?.signals ?? null,
      });
      res.json({ html });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  return app;
}
