import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { VersionDelta } from './types';

/**
 * Build a VersionDelta from explicit CLI flags.
 */
export function detectFromFlags(name: string, from: string, to: string): VersionDelta {
    return { name, fromVersion: from, toVersion: to };
}

/**
 * Parse a git diff of package.json to extract all dependency version changes.
 * Returns an array of VersionDelta — one per changed dependency.
 */
export function parsePackageJsonDiff(diffText: string): VersionDelta[] {
    const deltas: VersionDelta[] = [];

    // Match paired -/+ lines for version changes in dependencies
    const lines = diffText.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
        const removedLine = lines[i];
        const addedLine = lines[i + 1];

        if (!removedLine.startsWith('-') || !addedLine.startsWith('+')) continue;

        // Pattern: -    "package": "^1.0.0"   /   +    "package": "^2.0.0"
        const removedMatch = removedLine.match(/"([^"]+)"\s*:\s*"[~^]?(\d+\.\d+\.\d+[^"]*)"/);
        const addedMatch = addedLine.match(/"([^"]+)"\s*:\s*"[~^]?(\d+\.\d+\.\d+[^"]*)"/);

        if (removedMatch && addedMatch && removedMatch[1] === addedMatch[1]) {
            const name = removedMatch[1];
            const fromVer = removedMatch[2];
            const toVer = addedMatch[2];
            if (fromVer !== toVer) {
                deltas.push({ name, fromVersion: fromVer, toVersion: toVer });
                i++; // skip the + line we already consumed
            }
        }
    }

    return deltas;
}

/**
 * Compare the installed version in node_modules against what's in package.json.
 * This catches cases where `npm install` was run but not yet committed.
 */
function detectFromNodeModules(codebasePath: string): VersionDelta[] {
    const deltas: VersionDelta[] = [];
    const pkgJsonPath = path.join(codebasePath, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return deltas;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const allDeps: Record<string, string> = {
        ...(pkgJson.dependencies ?? {}),
        ...(pkgJson.devDependencies ?? {}),
    };

    for (const [name, declaredRange] of Object.entries(allDeps)) {
        // Extract the version number from the range (strip ^, ~, >=, etc.)
        const declaredMatch = declaredRange.match(/(\d+\.\d+\.\d+)/);
        if (!declaredMatch) continue;
        const declaredVer = declaredMatch[1];

        // Check what's actually installed
        const installedPkgPath = path.join(codebasePath, 'node_modules', name, 'package.json');
        if (!fs.existsSync(installedPkgPath)) continue;

        try {
            const installed = JSON.parse(fs.readFileSync(installedPkgPath, 'utf8'));
            const installedVer = installed.version;
            if (installedVer && installedVer !== declaredVer) {
                // installed differs from declared — could be a version bump in progress
                deltas.push({ name, fromVersion: declaredVer, toVersion: installedVer });
            }
        } catch { /* skip corrupt package.json */ }
    }

    return deltas;
}

/**
 * Compare package.json against package-lock.json to find version mismatches.
 */
function detectFromLockfile(codebasePath: string): VersionDelta[] {
    const deltas: VersionDelta[] = [];
    const pkgJsonPath = path.join(codebasePath, 'package.json');
    const lockPath = path.join(codebasePath, 'package-lock.json');

    if (!fs.existsSync(pkgJsonPath) || !fs.existsSync(lockPath)) return deltas;

    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const packages = lockJson.packages ?? {};

    const allDeps: Record<string, string> = {
        ...(pkgJson.dependencies ?? {}),
        ...(pkgJson.devDependencies ?? {}),
    };

    for (const [name, declaredRange] of Object.entries(allDeps)) {
        const declaredMatch = declaredRange.match(/(\d+\.\d+\.\d+)/);
        if (!declaredMatch) continue;
        const declaredVer = declaredMatch[1];

        const lockEntry = packages[`node_modules/${name}`];
        if (lockEntry && lockEntry.version && lockEntry.version !== declaredVer) {
            deltas.push({ name, fromVersion: declaredVer, toVersion: lockEntry.version });
        }
    }

    return deltas;
}

/**
 * Run a git diff command and parse out dependency changes.
 */
function gitDiff(codebasePath: string, diffArgs: string): VersionDelta[] {
    try {
        const diff = execSync(`git diff ${diffArgs} -- package.json`, {
            cwd: codebasePath,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
        });
        if (diff.trim()) return parsePackageJsonDiff(diff);
    } catch { /* not a git repo or no diff */ }
    return [];
}

/**
 * Auto-detect version changes from git diff of package.json.
 * Tries multiple strategies in priority order:
 *   1. Unstaged changes (git diff HEAD)
 *   2. Staged changes   (git diff --cached)
 *   3. Last commit       (git diff HEAD~1 HEAD)
 *   4. node_modules vs package.json mismatch
 *   5. package-lock.json vs package.json mismatch
 *
 * Returns all detected VersionDeltas (may be multiple packages).
 */
export function detectFromGitDiff(codebasePath: string): VersionDelta[] {
    // Check if it's a git repo
    const isGitRepo = (() => {
        try {
            execSync('git rev-parse --is-inside-work-tree', {
                cwd: codebasePath,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            return true;
        } catch { return false; }
    })();

    let deltas: VersionDelta[] = [];

    if (isGitRepo) {
        // Strategy 1: unstaged changes
        deltas = gitDiff(codebasePath, 'HEAD');
        if (deltas.length > 0) return deltas;

        // Strategy 2: staged changes
        deltas = gitDiff(codebasePath, '--cached');
        if (deltas.length > 0) return deltas;

        // Strategy 3: last commit
        deltas = gitDiff(codebasePath, 'HEAD~1 HEAD');
        if (deltas.length > 0) return deltas;
    }

    // Strategy 4: node_modules mismatch
    deltas = detectFromNodeModules(codebasePath);
    if (deltas.length > 0) return deltas;

    // Strategy 5: lockfile mismatch
    deltas = detectFromLockfile(codebasePath);
    if (deltas.length > 0) return deltas;

    // Nothing found
    const hint = isGitRepo
        ? 'No dependency version changes detected in recent git history or node_modules.'
        : `${codebasePath} is not a git repository.`;

    throw new Error(
        `${hint}\nPass versions explicitly:  --package <name> --from <ver> --to <ver>`
    );
}
