import * as fs from 'fs';
import * as path from 'path';
import { parse as parseTS } from '@typescript-eslint/typescript-estree';
import { BreakingChange, Callsite } from './types';

const SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

const IGNORE_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache',
]);

/**
 * Stage 4: Find all callsites in the codebase that match breaking changes.
 */
export async function findCallsites(
    codebasePath: string,
    changes: BreakingChange[]
): Promise<Callsite[]> {
    const files = collectFiles(codebasePath);
    const callsites: Callsite[] = [];

    for (const file of files) {
        const relPath = path.relative(codebasePath, file);
        let source: string;
        try {
            source = fs.readFileSync(file, 'utf8');
        } catch {
            continue;
        }

        // Text scan first (fast)
        for (const change of changes) {
            const symbol = change.symbol;
            // Find all occurrences of the symbol in the file text
            const textMatches = findTextMatches(source, symbol);
            if (textMatches.length === 0) continue;

            // AST pass for precision
            let ast;
            try {
                ast = parseTS(source, {
                    jsx: true,
                    loc: true,
                    range: true,
                    comment: true,
                    errorOnUnknownASTType: false,
                });
            } catch {
                // If AST parse fails, fall back to text matches with lower confidence
                for (const match of textMatches) {
                    callsites.push({
                        file: relPath,
                        line: match.line,
                        column: match.column,
                        snippet: getSnippet(source, match.line),
                        snippetStartLine: Math.max(1, match.line - 2),
                        change,
                        confidence: 'medium',
                    });
                }
                continue;
            }

            // Walk the AST to classify matches
            const astCallsites = classifyWithAST(ast, source, change, relPath, textMatches);
            callsites.push(...astCallsites);
        }
    }

    // Sort by confidence (high first), then by file and line
    const confOrder = { high: 0, medium: 1, low: 2 };
    callsites.sort((a, b) =>
        confOrder[a.confidence] - confOrder[b.confidence]
        || a.file.localeCompare(b.file)
        || a.line - b.line
    );

    return callsites;
}

function collectFiles(dir: string): string[] {
    const results: string[] = [];

    function walk(currentDir: string) {
        let entries;
        try { entries = fs.readdirSync(currentDir, { withFileTypes: true }); }
        catch { return; }

        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            if (IGNORE_DIRS.has(entry.name)) continue;

            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (SUPPORTED_EXTENSIONS.includes(path.extname(entry.name))) {
                results.push(fullPath);
            }
        }
    }

    walk(dir);
    return results;
}

interface TextMatch {
    line: number;
    column: number;
    inComment: boolean;
    inString: boolean;
}

function findTextMatches(source: string, symbol: string): TextMatch[] {
    const matches: TextMatch[] = [];
    const lines = source.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let col = line.indexOf(symbol);
        while (col !== -1) {
            const inComment = isInComment(line, col);
            const inString = isInString(line, col);
            matches.push({
                line: i + 1,
                column: col,
                inComment,
                inString,
            });
            col = line.indexOf(symbol, col + 1);
        }
    }

    return matches;
}

function isInComment(line: string, col: number): boolean {
    const before = line.slice(0, col);
    return before.includes('//') || before.includes('/*');
}

function isInString(line: string, col: number): boolean {
    const before = line.slice(0, col);
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    for (let i = 0; i < before.length; i++) {
        const ch = before[i];
        if (ch === '\\') { i++; continue; }
        if (ch === "'" && !inDouble && !inTemplate) inSingle = !inSingle;
        if (ch === '"' && !inSingle && !inTemplate) inDouble = !inDouble;
        if (ch === '`' && !inSingle && !inDouble) inTemplate = !inTemplate;
    }
    return inSingle || inDouble || inTemplate;
}

function getSnippet(source: string, matchLine: number, context = 2): string[] {
    const lines = source.split('\n');
    const start = Math.max(0, matchLine - 1 - context);
    const end = Math.min(lines.length, matchLine + context);
    return lines.slice(start, end);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function classifyWithAST(ast: any, source: string, change: BreakingChange, relPath: string, textMatches: TextMatch[]): Callsite[] {
    const callsites: Callsite[] = [];

    // Collect all import declarations to check if the symbol is imported from the right module
    const imports = new Set<string>();
    walkAST(ast, (node) => {
        if (node.type === 'ImportDeclaration') {
            const src = node.source?.value;
            if (src) {
                // Collect imported specifiers
                for (const spec of (node.specifiers ?? [])) {
                    if (spec.type === 'ImportDefaultSpecifier') imports.add(spec.local?.name ?? '');
                    if (spec.type === 'ImportSpecifier') imports.add(spec.imported?.name ?? spec.local?.name ?? '');
                    if (spec.type === 'ImportNamespaceSpecifier') imports.add(spec.local?.name ?? '');
                }
            }
        }
    });

    for (const match of textMatches) {
        let confidence: 'high' | 'medium' | 'low';

        if (match.inComment) {
            confidence = 'low';
        } else if (match.inString) {
            confidence = 'low';
        } else {
            // Check if any part of the symbol appears in imports
            const symbolParts = change.symbol.split('.');
            const rootSymbol = symbolParts[0];
            if (imports.has(rootSymbol) || imports.has(change.symbol)) {
                confidence = 'high';
            } else {
                confidence = 'medium';
            }
        }

        // Skip low-confidence comment/string matches
        if (confidence === 'low') continue;

        callsites.push({
            file: relPath,
            line: match.line,
            column: match.column,
            snippet: getSnippet(source, match.line),
            snippetStartLine: Math.max(1, match.line - 2),
            change,
            confidence,
        });
    }

    return callsites;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walkAST(node: any, visitor: (node: any) => void) {
    if (!node || typeof node !== 'object') return;
    visitor(node);
    for (const key of Object.keys(node)) {
        const val = node[key];
        if (Array.isArray(val)) {
            for (const child of val) walkAST(child, visitor);
        } else if (val && typeof val === 'object' && val.type) {
            walkAST(val, visitor);
        }
    }
}
