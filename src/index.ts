#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { detectFromFlags, detectFromGitDiff } from './detect';
import { fetchChangelog } from './fetch';
import { extractBreakingChanges } from './extract';
import { findCallsites } from './analyze';
import { launchTUI } from './tui';
import { AnalysisResult, VersionDelta } from './types';

const program = new Command();

program
    .name('segfault')
    .description('Surface breaking dependency changes in your codebase')
    .version('0.1.0')
    .option('-p, --package <name>', 'Package name (e.g. react)')
    .option('-f, --from <version>', 'Previous version (e.g. 18.3.1)')
    .option('-t, --to <version>', 'New version (e.g. 19.0.0)')
    .option('-c, --codebase <path>', 'Path to your codebase', '.')
    .option('--json', 'Output JSON instead of TUI')
    .option('--changelog <text>', 'Provide changelog text directly (skips fetch)')
    .option('--demo', 'Use hardcoded React 19 breaking changes (no API key needed)')
    .parse(process.argv);

const opts = program.opts<{
    package?: string;
    from?: string;
    to?: string;
    codebase: string;
    json?: boolean;
    changelog?: string;
    demo?: boolean;
}>();

const DEMO_BREAKING_CHANGES = [
    {
        kind: 'removed' as const,
        symbol: 'ReactDOM.render',
        module: 'react-dom',
        oldSignature: 'ReactDOM.render(element, container)',
        newSignature: 'createRoot(container).render(element)',
        description: 'ReactDOM.render was removed. Use createRoot from react-dom/client instead.',
    },
    {
        kind: 'removed' as const,
        symbol: 'unmountComponentAtNode',
        module: 'react-dom',
        oldSignature: 'unmountComponentAtNode(container)',
        newSignature: 'root.unmount()',
        description: 'unmountComponentAtNode was removed. Call .unmount() on the root created by createRoot.',
    },
    {
        kind: 'import_changed' as const,
        symbol: 'createRoot',
        module: 'react-dom/client',
        oldSignature: "import ReactDOM from 'react-dom'",
        newSignature: "import { createRoot } from 'react-dom/client'",
        description: 'createRoot must now be imported from react-dom/client, not react-dom.',
    },
    {
        kind: 'removed' as const,
        symbol: 'ReactDOM.hydrate',
        module: 'react-dom',
        oldSignature: 'ReactDOM.hydrate(element, container)',
        newSignature: 'hydrateRoot(container, element)',
        description: 'ReactDOM.hydrate was removed. Use hydrateRoot from react-dom/client instead.',
    },
];

async function main() {
    // ── Stage 1: Detect ───────────────────────────────────────────────────────
    let delta: VersionDelta;
    const spinner = ora('Detecting version change…').start();

    try {
        if (opts.package && opts.from && opts.to) {
            // Explicit flags — single package
            delta = detectFromFlags(opts.package, opts.from, opts.to);
        } else {
            // Auto-detect from git diff / node_modules / lockfile
            const deltas = detectFromGitDiff(opts.codebase);
            if (deltas.length === 1) {
                delta = deltas[0];
            } else {
                // Multiple packages changed — show them all and pick the first for now
                spinner.succeed(`Detected ${chalk.bold(String(deltas.length))} dependency changes:`);
                deltas.forEach(d => {
                    console.log(`  ${chalk.gray('·')} ${chalk.bold(d.name)}  ${chalk.gray(d.fromVersion)} → ${chalk.green(d.toVersion)}`);
                });
                console.log(chalk.gray(`  Analyzing first: ${deltas[0].name}. Use --package to pick a specific one.\n`));
                delta = deltas[0];
            }
        }
        if ((delta as VersionDelta)) {
            spinner.succeed(`${chalk.bold(delta.name)}  ${chalk.gray(delta.fromVersion)} → ${chalk.green(delta.toVersion)}`);
        }
    } catch (err) {
        spinner.fail((err as Error).message);
        process.exit(1);
    }

    // ── Check API key before any LLM calls (skip in demo mode) ───────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!opts.demo && !apiKey) {
        console.error(chalk.red('\n✗ GEMINI_API_KEY environment variable is not set.'));
        console.error('  Export it with: export GEMINI_API_KEY=your_key_here');
        console.error(chalk.gray('  (or use --demo to run without an API key)'));
        process.exit(1);
    }

    // ── Stage 2 & 3: Fetch + Extract (or demo shortcut) ──────────────────────
    let changes;

    if (opts.demo) {
        console.log(chalk.gray('  --demo: skipping fetch and LLM extract'));
        changes = DEMO_BREAKING_CHANGES;
        console.log(chalk.cyan(`  ✔ Injected ${changes.length} React 19 breaking changes`));
        changes.forEach(c => {
            console.log(`  ${chalk.gray('·')} ${chalk.yellow(`[${c.kind}]`)} ${c.symbol}`);
        });
    } else {
        // Stage 2: Fetch
        let changelogText: string;
        if (opts.changelog) {
            changelogText = opts.changelog;
            console.log(chalk.gray('  Using provided changelog text'));
        } else {
            const fetchSpinner = ora(`Fetching changelog for ${delta.name}…`).start();
            try {
                changelogText = await fetchChangelog(delta);
                fetchSpinner.succeed(`Changelog fetched (${Math.round(changelogText.length / 1024)} KB)`);
            } catch (err) {
                fetchSpinner.fail(`Fetch failed: ${(err as Error).message}`);
                process.exit(1);
            }
        }

        // Stage 3: Extract
        const extractSpinner = ora('Extracting breaking changes with Gemini…').start();
        try {
            changes = await extractBreakingChanges(changelogText!, delta, apiKey!);
            if (changes.length === 0) {
                extractSpinner.succeed('No breaking changes found in this version range.');
                process.exit(0);
            }
            extractSpinner.succeed(`Found ${chalk.red(String(changes.length))} breaking change${changes.length === 1 ? '' : 's'}`);
            changes.forEach(c => {
                console.log(`  ${chalk.gray('·')} ${chalk.yellow(`[${c.kind}]`)} ${c.symbol}`);
            });
        } catch (err) {
            extractSpinner.fail(`Extract failed: ${(err as Error).message}`);
            process.exit(1);
        }
    }

    // ── Stage 4: Analyze ──────────────────────────────────────────────────────
    const analyzeSpinner = ora(`Scanning codebase at ${opts.codebase}…`).start();
    let callsites;
    try {
        callsites = await findCallsites(opts.codebase, changes);
        analyzeSpinner.succeed(
            `Found ${chalk.red(String(callsites.length))} callsite${callsites.length === 1 ? '' : 's'} across your codebase`
        );
    } catch (err) {
        analyzeSpinner.fail(`Analysis failed: ${(err as Error).message}`);
        process.exit(1);
    }

    const result: AnalysisResult = { delta, changes, callsites };

    // ── Stage 5: Surface ──────────────────────────────────────────────────────
    if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        if (callsites.length === 0) {
            console.log(chalk.green('\n✓ No callsites matched in your codebase — you may be safe to upgrade.'));
        } else {
            console.log('');
            launchTUI(result, opts.codebase);
        }
    }
}

main().catch(err => {
    console.error(chalk.red('\nUnexpected error:'), err);
    process.exit(1);
});
