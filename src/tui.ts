import * as path from 'path';
import { execSync } from 'child_process';
import * as blessed from 'blessed';
import chalk from 'chalk';
import { AnalysisResult, BreakingChange, Callsite } from './types';

const KIND_COLOR: Record<string, (s: string) => string> = {
    removed: chalk.red,
    renamed: chalk.yellow,
    signature_changed: chalk.yellow,
    behavior_changed: chalk.magenta,
    import_changed: chalk.cyan,
};

const CONF_DOT: Record<string, string> = {
    high: chalk.red('●'),
    medium: chalk.yellow('●'),
    low: chalk.gray('●'),
};

const ACTIVE_BORDER = '#8888ff';
const INACTIVE_BORDER = '#444466';

export function launchTUI(result: AnalysisResult, codebasePath: string): void {
    const { delta, changes, callsites } = result;

    const callsitesByChange = new Map<string, Callsite[]>();
    for (const change of changes) {
        callsitesByChange.set(change.symbol, []);
    }
    for (const cs of callsites) {
        const list = callsitesByChange.get(cs.change.symbol) ?? [];
        list.push(cs);
        callsitesByChange.set(cs.change.symbol, list);
    }

    const screen = blessed.screen({
        smartCSR: true,
        title: 'segfault',
        fullUnicode: true,
    });

    const header = blessed.box({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: 1,
        content: ` {bold}segfault{/bold}  {gray-fg}│{/gray-fg}  ${delta.name}  ${delta.fromVersion} → {green-fg}${delta.toVersion}{/green-fg}  {gray-fg}│{/gray-fg}  ${changes.length} breaks  {gray-fg}│{/gray-fg}  ${callsites.length} callsites`,
        tags: true,
        style: { bg: '#1a1a2e', fg: '#e0e0e0' },
    });

    const leftPane = blessed.list({
        parent: screen,
        top: 1,
        left: 0,
        width: '35%',
        height: '60%-1',
        label: ' Breaking Changes ',
        border: { type: 'line' },
        style: {
            border: { fg: ACTIVE_BORDER },
            selected: { bg: '#2a2a4a', bold: true },
            item: { fg: '#cccccc' },
        } as never,
        keys: true,
        mouse: true,
        scrollable: true,
        scrollbar: { ch: '▐', style: { bg: '#444466' } },
        items: changes.map(c => {
            const color = KIND_COLOR[c.kind] ?? chalk.white;
            const count = (callsitesByChange.get(c.symbol) ?? []).length;
            const countStr = count > 0 ? chalk.gray(` (${count})`) : '';
            return ` ${color(`[${c.kind}]`)} ${c.symbol}${countStr}`;
        }),
    });

    const rightPane = blessed.list({
        parent: screen,
        top: 1,
        left: '35%',
        width: '65%',
        height: '60%-1',
        label: ' Callsites ',
        border: { type: 'line' },
        style: {
            border: { fg: INACTIVE_BORDER },
            selected: { bg: '#2a2a4a', bold: true },
            item: { fg: '#cccccc' },
        } as never,
        keys: true,
        mouse: true,
        scrollable: true,
        scrollbar: { ch: '▐', style: { bg: '#444466' } },
        items: [],
    });

    const preview = blessed.box({
        parent: screen,
        top: '60%',
        left: 0,
        width: '100%',
        height: '40%-1',
        label: ' Preview ',
        border: { type: 'line' },
        style: {
            border: { fg: INACTIVE_BORDER },
            fg: '#cccccc',
        },
        scrollable: true,
        scrollbar: { ch: '▐', style: { bg: '#444466' } },
        tags: true,
        content: '',
    });

    const footer = blessed.box({
        parent: screen,
        bottom: 0,
        left: 0,
        width: '100%',
        height: 1,
        content: ' {bold}[↑↓]{/bold} navigate  {bold}[Tab]{/bold} switch pane  {bold}[Enter]{/bold} open in $EDITOR  {bold}[e]{/bold} export  {bold}[q]{/bold} quit',
        tags: true,
        style: { bg: '#1a1a2e', fg: '#666688' },
    });

    let selectedChangeIdx = 0;
    let activePane: 'left' | 'right' = 'left';
    let currentCallsites: Callsite[] = [];

    function highlightActivePane() {
        const leftBorder = activePane === 'left' ? ACTIVE_BORDER : INACTIVE_BORDER;
        const rightBorder = activePane === 'right' ? ACTIVE_BORDER : INACTIVE_BORDER;
        (leftPane.style as unknown as { border: { fg: string } }).border.fg = leftBorder;
        (rightPane.style as unknown as { border: { fg: string } }).border.fg = rightBorder;
        screen.render();
    }

    function updateCallsitePane(changeIdx: number) {
        selectedChangeIdx = changeIdx;
        const change = changes[changeIdx];
        if (!change) return;

        currentCallsites = callsitesByChange.get(change.symbol) ?? [];

        const items = currentCallsites.length === 0
            ? [chalk.gray('  (no callsites found)')]
            : currentCallsites.map(cs =>
                ` ${CONF_DOT[cs.confidence]}  ${cs.file}:${chalk.cyan(String(cs.line))}  ${chalk.gray(cs.confidence)}`
            );

        (rightPane as unknown as { setItems: (i: string[]) => void }).setItems(items);
        rightPane.select(0);

        updatePreview(change, null);
        screen.render();
    }

    function updatePreview(change: BreakingChange, cs: Callsite | null) {
        if (!cs) {
            const color = KIND_COLOR[change.kind] ?? chalk.white;
            const lines: string[] = [
                `  ${color(`[${change.kind}]`)}  {bold}${change.symbol}{/bold}`,
                '',
                `  ${change.description}`,
            ];
            if (change.oldSignature) lines.push('', `  {gray-fg}Before:{/gray-fg} ${change.oldSignature}`);
            if (change.newSignature) lines.push(`  {green-fg}After:{/green-fg}  ${change.newSignature}`);
            preview.setContent(lines.join('\n'));
            preview.setLabel(` ${change.symbol} `);
        } else {
            const lines: string[] = [`  ${cs.file}  {cyan-fg}line ${cs.line}{/cyan-fg}`, ''];
            cs.snippet.forEach((line, i) => {
                const lineNum = cs.snippetStartLine + i;
                const isMatch = lineNum === cs.line;
                const num = String(lineNum).padStart(4);
                const separator = isMatch ? '{red-fg}▶{/red-fg}' : ' ';
                const content = isMatch ? `{bold}${line}{/bold}` : `{gray-fg}${line}{/gray-fg}`;
                lines.push(`  {gray-fg}${num}{/gray-fg} ${separator} ${content}`);
            });
            preview.setContent(lines.join('\n'));
            preview.setLabel(` ${cs.file}:${cs.line} `);
        }
        screen.render();
    }

    leftPane.on('select item', (_el, idx: number) => {
        updateCallsitePane(idx);
    });

    rightPane.on('select item', (_el, idx: number) => {
        const cs = currentCallsites[idx];
        if (cs) updatePreview(cs.change, cs);
    });

    screen.key(['tab'], () => {
        if (activePane === 'left') {
            activePane = 'right';
            rightPane.focus();
        } else {
            activePane = 'left';
            leftPane.focus();
        }
        highlightActivePane();
    });

    screen.key(['enter'], () => {
        if (activePane === 'right') {
            const idx = (rightPane as unknown as { selected: number }).selected;
            const cs = currentCallsites[idx];
            if (cs) openInEditor(screen, cs, codebasePath);
        }
    });

    screen.key(['e'], () => {
        const reportPath = exportReport(result);
        preview.setContent(`  {green-fg}Report exported to:{/green-fg} ${reportPath}`);
        screen.render();
    });

    screen.key(['q', 'C-c'], () => {
        screen.destroy();
        process.exit(0);
    });

    leftPane.focus();
    highlightActivePane();
    if (changes.length > 0) updateCallsitePane(0);

    void header; void footer;

    screen.render();
}

function openInEditor(screen: blessed.Widgets.Screen, cs: Callsite, codebasePath: string): void {
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi';
    const absPath = path.resolve(codebasePath, cs.file);

    try {
        screen.exec(editor, ['+' + cs.line, absPath], {}, (err: Error | null) => {
            if (err) {
                screen.exec(editor, [absPath], {}, () => {
                    screen.render();
                });
            } else {
                screen.render();
            }
        });
    } catch {
        try {
            screen.program.clear();
            screen.program.disableMouse();
            screen.program.showCursor();
            screen.program.normalBuffer();
            execSync(`${editor} +${cs.line} "${absPath}"`, { stdio: 'inherit' });
        } catch { /* noop */ }
        finally {
            screen.program.alternateBuffer();
            screen.program.hideCursor();
            screen.program.enableMouse();
            screen.alloc();
            screen.render();
        }
    }
}

function exportReport(result: AnalysisResult): string {
    const { delta, changes, callsites } = result;
    const lines: string[] = [
        `# segfault report: ${delta.name} ${delta.fromVersion} → ${delta.toVersion}`,
        '',
        `**${changes.length} breaking changes · ${callsites.length} callsites**`,
        '',
    ];

    for (const change of changes) {
        lines.push(`## \`${change.symbol}\` (${change.kind})`);
        lines.push('');
        lines.push(change.description);
        if (change.oldSignature) lines.push('', `**Before:** \`${change.oldSignature}\``);
        if (change.newSignature) lines.push(`**After:**  \`${change.newSignature}\``);
        lines.push('');

        const csList = callsites.filter(cs => cs.change.symbol === change.symbol);
        if (csList.length === 0) {
            lines.push('_No callsites found._');
        } else {
            for (const cs of csList) {
                lines.push(`- \`${cs.file}:${cs.line}\` (${cs.confidence})`);
                lines.push('  ```');
                cs.snippet.forEach((l, i) => {
                    const lineNum = cs.snippetStartLine + i;
                    const marker = lineNum === cs.line ? '→' : ' ';
                    lines.push(`  ${marker} ${String(lineNum).padStart(4)} | ${l}`);
                });
                lines.push('  ```');
            }
        }
        lines.push('');
    }

    const outPath = `segfault-report-${delta.name}-${delta.toVersion}.md`;
    require('fs').writeFileSync(outPath, lines.join('\n'), 'utf8');
    return outPath;
}
