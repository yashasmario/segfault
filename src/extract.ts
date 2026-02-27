import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { BreakingChange, VersionDelta } from './types';

// Models to try in order — lite is cheapest/fastest; flash is fallback
const MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash'];

// Max chars to send — ~20k tokens on free tier; stay well under
const MAX_CHANGELOG_CHARS = 25_000;

const EXTRACTION_SCHEMA = {
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            kind: {
                type: SchemaType.STRING,
                enum: ['removed', 'renamed', 'signature_changed', 'behavior_changed', 'import_changed'],
                description: 'The type of breaking change',
            },
            symbol: {
                type: SchemaType.STRING,
                description: 'The exact API symbol that changed, e.g. "ReactDOM.render", "createStore", "act"',
            },
            module: {
                type: SchemaType.STRING,
                description: 'The npm package or sub-module the symbol is exported from, e.g. "react-dom", "redux"',
            },
            oldSignature: {
                type: SchemaType.STRING,
                description: 'The old function/method signature or usage pattern, if available',
            },
            newSignature: {
                type: SchemaType.STRING,
                description: 'The new function/method signature or recommended replacement, if available',
            },
            description: {
                type: SchemaType.STRING,
                description: 'One-sentence plain English description of what changed and why it breaks',
            },
        },
        required: ['kind', 'symbol', 'description'],
    },
};

const SYSTEM_PROMPT = `You are a senior software engineer analyzing a package changelog to identify breaking API changes.

Your task: extract ONLY breaking changes — changes that will cause runtime errors, TypeScript type errors, or behavioural regressions in code that previously worked.

DO NOT include:
- Bug fixes (unless they change observable behaviour apps relied on)
- New features that are purely additive
- Internal/private API changes
- Performance changes
- Deprecation warnings (unless the deprecated API was fully removed)

DO include:
- Removed functions, methods, classes, or exports
- Renamed exports or modules
- Changed function signatures (added required parameters, removed parameters, changed types)
- Changed import paths
- Removed hooks, context, or middleware patterns

Be precise with the \`symbol\` field — it should be exactly what a developer would type in code (e.g. "ReactDOM.render", not "render method of ReactDOM").
For the \`module\` field, include the npm package it is imported from (e.g. "react-dom", "react").
`;

/** Extract a retry delay in ms from a 429 error message, or fall back to a default */
function parseRetryDelay(err: unknown): number {
    const msg = String(err);
    const match = msg.match(/retry in ([\d.]+)s/i);
    if (match) return Math.ceil(parseFloat(match[1]) * 1000) + 500;
    return 15_000;
}

function is429(err: unknown): boolean {
    return String(err).includes('429') || String(err).toLowerCase().includes('quota');
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Trim changelog text to fit within token budget.
 * Prioritises sections that mention "breaking" or "migration".
 */
function trimChangelog(text: string): string {
    if (text.length <= MAX_CHANGELOG_CHARS) return text;

    const sections = text.split(/\n(?=#{1,3} )/);
    const priority: string[] = [];
    const rest: string[] = [];

    for (const section of sections) {
        const lower = section.toLowerCase();
        if (lower.includes('breaking') || lower.includes('migration') || lower.includes('removed') || lower.includes('deprecated')) {
            priority.push(section);
        } else {
            rest.push(section);
        }
    }

    let result = priority.join('\n');
    if (result.length < MAX_CHANGELOG_CHARS) {
        for (const section of rest) {
            if (result.length + section.length > MAX_CHANGELOG_CHARS) break;
            result += '\n' + section;
        }
    }

    return result.slice(0, MAX_CHANGELOG_CHARS);
}

export async function extractBreakingChanges(
    changelogText: string,
    delta: VersionDelta,
    apiKey: string
): Promise<BreakingChange[]> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const trimmed = trimChangelog(changelogText);

    const prompt = `Package: ${delta.name}
Version change: ${delta.fromVersion} → ${delta.toVersion}

Changelog / Release notes:
---
${trimmed}
---

Extract all breaking changes as a JSON array.`;

    for (const modelName of MODELS) {
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction: SYSTEM_PROMPT,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: EXTRACTION_SCHEMA as never,
            },
        });

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const result = await model.generateContent(prompt);
                const text = result.response.text();
                const parsed = JSON.parse(text) as BreakingChange[];
                return parsed;
            } catch (err) {
                if (is429(err)) {
                    if (attempt < 3) {
                        const delay = parseRetryDelay(err);
                        process.stderr.write(
                            `\r  ⏳ Rate limited on ${modelName} — waiting ${Math.round(delay / 1000)}s before retry (${attempt}/3)…`
                        );
                        await sleep(delay);
                        process.stderr.write('\r' + ' '.repeat(80) + '\r');
                    } else {
                        process.stderr.write(
                            `\r  ⚠ ${modelName} quota exhausted, trying next model…\n`
                        );
                        break;
                    }
                } else {
                    throw err;
                }
            }
        }
    }

    throw new Error(
        'All Gemini models are rate-limited. Please wait a minute and try again.\n' +
        'Tip: use --changelog to pass your own changelog text and skip the LLM quota limit for testing.'
    );
}
