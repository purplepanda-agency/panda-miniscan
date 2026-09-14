#!/usr/bin/env node
import { Command } from 'commander';
import { loadEnv } from '../src/env.js';
import { analyzeSite } from '../src/index.js';
import { formatCliReport } from '../src/report.js';

loadEnv();

const program = new Command();

program
  .name('jsonld-analyze')
  .description('Crawl a site for JSON-LD, score it, and suggest markup when missing')
  .argument('<url>', 'Website URL to analyze')
  .option('--max-pages <n>', 'Maximum pages to crawl', (v) => parseInt(v, 10), 50)
  .option('--concurrency <n>', 'Parallel fetches', (v) => parseInt(v, 10), 5)
  .option('--timeout <ms>', 'Per-request timeout in ms', (v) => parseInt(v, 10), 10000)
  .option('--json', 'Output machine-readable JSON', false)
  .option('--no-robots', 'Ignore robots.txt')
  .option('--skip-quickscan', 'Skip Gemini tech quickscan', false)
  .option('--skip-content-quickscan', 'Skip Gemini content quickscan', false)
  .action(async (url, opts) => {
    try {
      const report = await analyzeSite(url, {
        maxPages: opts.maxPages,
        concurrency: opts.concurrency,
        timeoutMs: opts.timeout,
        respectRobots: opts.robots,
        skipQuickscan: opts.skipQuickscan,
        skipContentQuickscan: opts.skipContentQuickscan,
        onProgress: opts.json
          ? undefined
          : (msg) => {
              process.stderr.write(`${msg}\n`);
            },
      });

      if (opts.json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        process.stdout.write(formatCliReport(report));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Error: ${message}`);
      process.exitCode = 1;
    }
  });

program.parse();
