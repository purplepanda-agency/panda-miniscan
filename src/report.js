import chalk from 'chalk';

/**
 * @param {Awaited<ReturnType<import('./index.js').analyzeSite>>} report
 */
export function formatCliReport(report) {
  const lines = [];
  const { summary } = report;

  lines.push('');
  lines.push(chalk.bold.cyan('JSON-LD Site Analyzer'));
  lines.push(chalk.dim(`Start: ${report.startUrl}`));
  lines.push(chalk.dim(`At:    ${report.analyzedAt}`));
  lines.push('');
  lines.push(chalk.bold('Summary'));
  lines.push(`  Pages crawled:     ${summary.crawled}`);
  lines.push(`  With JSON-LD:      ${summary.withJsonLd}`);
  lines.push(`  Without JSON-LD:   ${summary.withoutJsonLd}`);
  lines.push(`  Avg score:         ${summary.avgScore ?? 'n/a'}`);
  lines.push('');

  if (summary.topTypes.length) {
    lines.push(chalk.bold('Top types'));
    for (const { type, count } of summary.topTypes) {
      lines.push(`  ${type.padEnd(24)} ${count}`);
    }
    lines.push('');
  }

  if (summary.topIssues.length) {
    lines.push(chalk.bold('Top issues'));
    for (const { issue, count } of summary.topIssues) {
      lines.push(`  (${count}×) ${issue}`);
    }
    lines.push('');
  }

  if (summary.quickWins.length) {
    lines.push(chalk.bold('Quick wins'));
    for (const w of summary.quickWins) lines.push(`  • ${w}`);
    lines.push('');
  }

  if (report.llms) {
    lines.push(chalk.bold('llms.txt'));
    const llms = report.llms;
    const flag = llms.found ? chalk.green('found') : chalk.red('missing');
    const scoreLabel =
      llms.score == null && llms.found
        ? chalk.yellow('no score')
        : (llms.score ?? 0) >= 70
          ? chalk.green(String(llms.score ?? 0))
          : chalk.yellow(String(llms.score ?? 0));
    lines.push(`  ${llms.url}`);
    lines.push(`  ${flag}  score: ${scoreLabel}`);
    if (llms.verdict) lines.push(`  ${llms.verdict}`);
    for (const issue of llms.issues || []) lines.push(chalk.red(`  ! ${issue}`));
    for (const enh of (llms.enhancements || []).slice(0, 8)) lines.push(chalk.cyan(`  → ${enh}`));
    if (llms.suggestion) {
      lines.push(chalk.dim('  Suggested llms.txt:'));
      lines.push(
        llms.suggestion
          .split('\n')
          .map((l) => `    ${l}`)
          .join('\n')
      );
    }
    lines.push('');
  }

  if (report.quickscan) {
    lines.push(chalk.bold('Tech Quickscan'));
    const qs = report.quickscan;
    const role = report.audience === 'tech' ? 'tech' : 'business';
    const pick = (value) => {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        return String(role === 'tech' ? value.tech || value.business || value.text || '' : value.business || value.tech || value.text || '');
      }
      return String(value);
    };
    if (!qs.ok) {
      lines.push(chalk.red(`  ! ${qs.error || 'Tech Quickscan failed'}`));
    } else {
      const summary = pick(qs.summary);
      if (summary) lines.push(`  ${summary}`);
      for (const issue of qs.issues || []) {
        const text = pick(issue);
        if (text) lines.push(chalk.red(`  ! ${text}`));
        const evidence = pick(issue?.evidence);
        if (evidence) lines.push(chalk.red(`    evidence: ${evidence}`));
        const suggestion = pick(issue?.suggestion);
        if (suggestion) lines.push(chalk.red(`    → ${suggestion}`));
        const pages = Array.isArray(issue?.pages) ? issue.pages.filter(Boolean).slice(0, 5) : [];
        for (const page of pages) lines.push(chalk.red(`      · ${page}`));
      }
      const improvements = Array.isArray(qs.improvements) ? qs.improvements : qs.quickWins || [];
      for (const win of improvements) {
        const text = pick(win);
        if (text) lines.push(chalk.yellow(`  ~ ${text}`));
        const evidence = pick(win?.evidence);
        if (evidence) lines.push(chalk.yellow(`    evidence: ${evidence}`));
        const guide = pick(win?.suggestion || win?.guide);
        if (guide) lines.push(chalk.yellow(`    → ${guide}`));
        const pages = Array.isArray(win?.pages) ? win.pages.filter(Boolean).slice(0, 5) : [];
        for (const page of pages) lines.push(chalk.yellow(`      · ${page}`));
      }
    }
    lines.push('');
  }

  if (report.contentQuickscan) {
    lines.push(chalk.bold('Content Quickscan'));
    const qs = report.contentQuickscan;
    const role = report.audience === 'tech' ? 'tech' : 'business';
    const pick = (value) => {
      if (value == null) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'object') {
        return String(role === 'tech' ? value.tech || value.business || value.text || '' : value.business || value.tech || value.text || '');
      }
      return String(value);
    };
    if (!qs.ok) {
      lines.push(chalk.red(`  ! ${qs.error || 'Content Quickscan failed'}`));
    } else {
      const summary = pick(qs.summary);
      if (summary) lines.push(`  ${summary}`);
      if (Array.isArray(qs.focusPages) && qs.focusPages.length) {
        lines.push(`  Focus: ${qs.focusPages.slice(0, 8).join(', ')}`);
      }
      for (const issue of qs.issues || []) {
        const text = pick(issue);
        if (text) lines.push(chalk.red(`  ! ${text}`));
        const evidence = pick(issue?.evidence);
        if (evidence) lines.push(chalk.red(`    evidence: ${evidence}`));
        const suggestion = pick(issue?.suggestion);
        if (suggestion) lines.push(chalk.red(`    → ${suggestion}`));
        const pages = Array.isArray(issue?.pages) ? issue.pages.filter(Boolean).slice(0, 5) : [];
        for (const page of pages) lines.push(chalk.red(`      · ${page}`));
      }
      const improvements = Array.isArray(qs.improvements) ? qs.improvements : qs.quickWins || [];
      for (const win of improvements) {
        const text = pick(win);
        if (text) lines.push(chalk.yellow(`  ~ ${text}`));
        const evidence = pick(win?.evidence);
        if (evidence) lines.push(chalk.yellow(`    evidence: ${evidence}`));
        const guide = pick(win?.suggestion || win?.guide);
        if (guide) lines.push(chalk.yellow(`    → ${guide}`));
        const pages = Array.isArray(win?.pages) ? win.pages.filter(Boolean).slice(0, 5) : [];
        for (const page of pages) lines.push(chalk.yellow(`      · ${page}`));
      }
    }
    lines.push('');
  }

  if (report.general) {
    lines.push(chalk.bold('General'));
    const g = report.general;
    if (!g.ok) {
      lines.push(chalk.red(`  ! ${g.error || 'General overview failed'}`));
    } else {
      const fields = [
        ['Bedrijfsnaam en website', g.companyNameWebsite],
        ['Kernaanbod', g.coreOffering],
        ['Prijspositionering / merken', g.pricingBrands],
        ['Locatie(s) / verzorgingsgebied', g.locations],
        ['Kernzoektermen', g.searchTerms],
        ['Concurrenten', g.competitors],
        ['Ruwe data', g.rawData],
      ];
      for (const [label, value] of fields) {
        lines.push(chalk.bold(`  ${label}`));
        const text = value != null ? String(value).trim() : '';
        if (text) {
          for (const line of text.split(/\n+/)) lines.push(`    ${line}`);
        } else {
          lines.push('    —');
        }
      }
    }
    lines.push('');
  }

  lines.push(chalk.bold('Pages'));
  for (const page of report.pages) {
    lines.push('');
    const scoreLabel =
      page.score == null ? chalk.yellow('no score') : page.score >= 70 ? chalk.green(String(page.score)) : chalk.yellow(String(page.score));
    const flag = page.types?.length ? chalk.green('JSON-LD') : chalk.red('missing');
    lines.push(`${chalk.bold(page.url)}`);
    lines.push(`  ${flag}  score: ${scoreLabel}  types: ${(page.types || []).join(', ') || '—'}`);
    if (page.fetchError) lines.push(chalk.red(`  fetch: ${page.fetchError}`));
    if (page.verdict) lines.push(`  ${page.verdict}`);
    for (const issue of page.issues || []) lines.push(chalk.red(`  ! ${issue}`));
    const actionItems = (page.enhancements || []).filter((e) => !/^overall\s*:/i.test(String(e)));
    for (const enh of actionItems.slice(0, 8)) lines.push(chalk.cyan(`  → ${enh}`));
    if (actionItems.length > 8) {
      lines.push(chalk.dim(`  → … ${actionItems.length - 8} more`));
    }
    if (page.jsonLd?.length) {
      lines.push(chalk.dim('  Current JSON-LD:'));
      for (const block of page.jsonLd) {
        lines.push(
          block
            .split('\n')
            .map((l) => `    ${l}`)
            .join('\n')
        );
      }
    }
    if (page.suggestionScript) {
      lines.push(chalk.dim('  Suggested snippet:'));
      lines.push(
        page.suggestionScript
          .split('\n')
          .map((l) => `    ${l}`)
          .join('\n')
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}
