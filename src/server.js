/**
 * Local Node server — static UI + API.
 * For Cloudflare, see src/worker.js + wrangler.toml.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadEnv } from './env.js';
import { createApiApp } from './app.js';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3847;

const app = createApiApp();
app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Structa UI → http://localhost:${PORT}`);
});
