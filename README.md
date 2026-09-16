# Structa (panda-miniscan)

Web tool that crawls a website and surfaces **General** intake, **Channels**, **Meta** signals, on-demand **AI insights**, and a printable **client verslag**.

Under the hood the crawl still extracts JSON-LD / `/llms.txt` (used for Meta scores and AI context). Those dedicated panels are hidden in the UI.

General overview, insights and verslag need a Gemini (or Claude) API key. The crawl itself works without one.

## Requirements

- Node.js 20+

## Install

```bash
npm install
```

Create a local `.env` (already gitignored):

```bash
# Switch AI backend: gemini (default) or claude
AI_PROVIDER=gemini

GEMINI_API_KEY=your_key_here
# optional:
# GEMINI_MODEL=gemini-3.1-flash-lite
# GEMINI_MODEL_BASIC=gemini-3.1-flash-lite
# Disable fallbacks (primary model only):
# GEMINI_MODEL_FALLBACKS=none
# Or list custom fallbacks:
# GEMINI_MODEL_FALLBACKS=gemini-3-flash,gemini-3.5-flash

# Claude (when AI_PROVIDER=claude)
# ANTHROPIC_API_KEY=your_anthropic_key
# CLAUDE_MODEL=claude-sonnet-4-5
# CLAUDE_MODEL_BASIC=claude-haiku-4-5
```

Set `AI_PROVIDER=claude` to use Anthropic, or `AI_PROVIDER=gemini` to go back. Gemini and Claude keys/models can both stay in `.env`.

`GEMINI_MODEL` / `CLAUDE_MODEL` are used for insights. `*_MODEL_BASIC` is used for the General company overview.

After editing prompt markdown under `src/prompts/`, regenerate the Workers-safe bundle:

```bash
npm run embed:prompts
```

## CLI

```bash
npm run analyze -- https://example.com
npm run analyze -- https://example.com --max-pages 30 --json
npm run analyze -- https://example.com --skip-quickscan
```

## Web UI (local)

```bash
npm start
```

Open [http://localhost:3847](http://localhost:3847).

## Cloudflare Workers deploy

This app deploys as a **Worker** (Express API via `nodejs_compat`) with **static assets** from `public/`.

1. Install deps (includes Wrangler):

```bash
npm install
```

2. Login:

```bash
npx wrangler login
```

3. Local Cloudflare preview (uses `.dev.vars`):

```bash
cp .dev.vars.example .dev.vars
# put GEMINI_API_KEY in .dev.vars
npm run dev:cf
```

4. Set production secrets:

```bash
npx wrangler secret put GEMINI_API_KEY
# optional:
# npx wrangler secret put ANTHROPIC_API_KEY
```

5. Deploy:

```bash
npm run deploy
```

Wrangler prints a `*.workers.dev` URL. Point a custom domain in the Cloudflare dashboard if needed.

### Notes

- Long site crawls + AI generation need a **Workers Paid** plan (or high CPU limit). Uncomment `[limits]` / `cpu_ms` in `wrangler.toml` when on Paid.
- Non-secret defaults live under `[vars]` in `wrangler.toml`; secrets never go in git.
- Prompt `.md` files are embedded into `src/prompts/embedded.js` on deploy (`predeploy` / `embed:prompts`).
- The client verslag opens as a **print-ready HTML page** (browser print / “Save as PDF”).

## What it does

1. Discovers URLs via sitemap or same-origin BFS (fixed crawl budget in the UI)
2. Builds General intake (company overview) from the crawl
3. Detects public channels (socials, Google Business, shop, websites) from crawl links, meta, and structured data — not a live social API
4. Computes Meta signals (meta score, sitemap, tracking, robots, llms.txt, JSON-LD score)
5. Generates on-demand AI insights (editable) and a printable client verslag
