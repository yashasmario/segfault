import { VersionDelta } from './types';

const NPM_REGISTRY = 'https://registry.npmjs.org';
const GITHUB_API = 'https://api.github.com';

interface NpmPackage {
    repository?: { url?: string } | string;
}

/**
 * Stage 2: fetch changelog text for a given version delta.
 *
 * Strategy:
 *   1. Look up the package on npm registry to find its GitHub repo
 *   2. Fetch GitHub releases between fromVersion and toVersion
 *   3. Also try to fetch CHANGELOG.md from the repo
 *   4. Concatenate everything found
 */
export async function fetchChangelog(delta: VersionDelta): Promise<string> {
    const { name, fromVersion, toVersion } = delta;
    const parts: string[] = [];

    // 1. Get repo URL from npm registry
    let repoOwner = '';
    let repoName = '';

    try {
        const res = await fetch(`${NPM_REGISTRY}/${encodeURIComponent(name)}`);
        if (res.ok) {
            const pkg: NpmPackage = await res.json() as NpmPackage;
            const repoUrl = typeof pkg.repository === 'string'
                ? pkg.repository
                : pkg.repository?.url ?? '';

            const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
            if (match) {
                repoOwner = match[1];
                repoName = match[2];
            }
        }
    } catch { /* npm fetch failed, continue */ }

    // 2. Fetch GitHub releases
    if (repoOwner && repoName) {
        try {
            const releasesUrl = `${GITHUB_API}/repos/${repoOwner}/${repoName}/releases?per_page=100`;
            const res = await fetch(releasesUrl, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    ...(process.env.GITHUB_TOKEN ? { 'Authorization': `token ${process.env.GITHUB_TOKEN}` } : {}),
                },
            });

            if (res.ok) {
                const releases = await res.json() as Array<{ tag_name: string; name: string | null; body: string | null }>;

                // Find releases between fromVersion and toVersion
                const fromTag = normalizeTag(fromVersion);
                const toTag = normalizeTag(toVersion);

                let inRange = false;
                for (const release of releases) {
                    const tag = normalizeTag(release.tag_name);
                    if (tag === toTag) inRange = true;
                    if (inRange && release.body) {
                        parts.push(`## ${release.name || release.tag_name}\n\n${release.body}`);
                    }
                    if (tag === fromTag) break;
                }
            }
        } catch { /* GitHub fetch failed */ }

        // 3. Try CHANGELOG.md from repo
        try {
            for (const branch of ['main', 'master']) {
                const res = await fetch(
                    `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/CHANGELOG.md`
                );
                if (res.ok) {
                    const text = await res.text();
                    parts.push(`## CHANGELOG.md\n\n${text}`);
                    break;
                }
            }
        } catch { /* CHANGELOG fetch failed */ }
    }

    if (parts.length === 0) {
        throw new Error(
            `Could not find changelog for ${name} ${fromVersion} → ${toVersion}.\n` +
            `Try passing --changelog with the changelog text directly.`
        );
    }

    return parts.join('\n\n---\n\n');
}

function normalizeTag(version: string): string {
    return version.replace(/^v/, '');
}
