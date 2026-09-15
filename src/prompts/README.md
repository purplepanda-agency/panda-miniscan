# Prompt sources

Edit these markdown files to change AI instructions. Code loads them via `loadPrompt()` from `load.js`, which reads the **embedded** bundle (`embedded.js`).

After changing any `.md` file, run:

```bash
npm run embed:prompts
```

| File | Used by |
|---|---|
| `tech-quickscan.md` | [`../quickscan.js`](../quickscan.js) |
| `content-quickscan.md` | [`../content-quickscan.js`](../content-quickscan.js) |
| `general.md` | [`../general.js`](../general.js) |
| `ai-insights.md` | [`../ai-insights.js`](../ai-insights.js) |
| `client-verslag.md` | [`../client-verslag.js`](../client-verslag.js) |

Put `{{context}}` where crawl/HTML context should be injected. If omitted, context is appended under `## Website context`.
