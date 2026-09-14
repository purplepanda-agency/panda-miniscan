# Prompt sources

Edit these markdown files to change Gemini instructions. Code loads them via `loadPrompt()` from `load.js`.

| File | Used by |
|---|---|
| `tech-quickscan.md` | [`../quickscan.js`](../quickscan.js) |
| `content-quickscan.md` | [`../content-quickscan.js`](../content-quickscan.js) |
| `general.md` | *(add when ready — wire in `general.js`)* |

Put `{{context}}` where crawl/HTML context should be injected. If omitted, context is appended under `## Website context`.
