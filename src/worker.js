/**
 * Cloudflare Workers entry — Express API via nodejs_compat.
 * Static files are served from Workers Assets (see wrangler.toml).
 */

import { httpServerHandler } from 'cloudflare:node';
import { createApiApp } from './app.js';

const PORT = 3000;
const app = createApiApp();
app.listen(PORT);

export default httpServerHandler({ port: PORT });
