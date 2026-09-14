# JSON-LD Site Analyzer

Lightweight Node.js tool that crawls a website for JSON-LD structured data, scores what it finds, and suggests first-pass markup when pages have none. It also checks `/llms.txt` and runs a Gemini **Quickscan** for build/performance tips.

JSON-LD and llms.txt analysis work **without** an AI key. Quickscan needs `GEMINI_API_KEY`.

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

`GEMINI_MODEL` / `CLAUDE_MODEL` are used for Tech/Content Quickscan. `*_MODEL_BASIC` is used for the General company overview.

## CLI

```bash
npm run analyze -- https://example.com
npm run analyze -- https://example.com --max-pages 30 --json
npm run analyze -- https://example.com --skip-quickscan
```

## Web UI

```bash
npm start
```

Open [http://localhost:3847](http://localhost:3847). Results appear in **JSON-LD**, **llms.txt**, **Channels**, and on-demand Gemini tabs (Tech/Content Quickscan, General).

## What it does

1. Discovers URLs via sitemap or same-origin BFS
2. Extracts and scores JSON-LD
3. Suggests markup when missing
4. Fetches `/llms.txt`, scores it, or drafts a base file
5. Detects public channels (socials, Google Business, shop, websites) from crawl links, JSON-LD `sameAs`, and meta — not a live social API
6. Runs a Gemini quickscan for build/performance issues and quick wins
