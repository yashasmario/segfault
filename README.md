# segfault

> Surface breaking dependency changes in your codebase before they break production.

**segfault** detects dependency version bumps, extracts breaking changes using an LLM, statically analyzes your codebase to find affected callsites, and surfaces everything in an interactive TUI.

---
<img width="1470" height="956" alt="Screenshot 2026-03-26 at 12 19 11" src="https://github.com/user-attachments/assets/1756b7fe-314b-44e5-9132-d09357ca5f0d" />

<img width="1470" height="956" alt="Screenshot 2026-03-26 at 12 19 51" src="https://github.com/user-attachments/assets/3663c0b7-892c-4dd7-ad39-7d4d9701b913" />

<img width="1470" height="956" alt="Screenshot 2026-03-26 at 12 20 16" src="https://github.com/user-attachments/assets/f2108264-2524-48df-af45-b65117b284e2" />


## The Pipeline

```
1. DETECT   →  git diff / node_modules / lockfile  →  what changed?
2. FETCH    →  npm registry + GitHub releases       →  changelog text
3. EXTRACT  →  Gemini LLM (JSON mode)               →  BreakingChange[]
4. ANALYZE  →  text scan + AST walk                  →  Callsite[]
5. SURFACE  →  interactive TUI with code preview     →  fix it
```

---

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Run with auto-detect (inside a git repo after bumping a dep)
npx segfault

# Or specify explicitly
npx segfault --package react --from 18.3.1 --to 19.0.0 --codebase ./my-app

# Demo mode (no API key needed)
npx segfault --package react --from 18.3.1 --to 19.0.0 --codebase ./demo-app --demo
```

> See [INSTALL.md](./INSTALL.md) for detailed setup instructions.

---

## How Auto-Detect Works

When you run `npx segfault` without `--package`/`--from`/`--to`, it tries **5 strategies** in order to figure out what dependency changed:

| # | Strategy                | When it triggers                                              |
|---|-------------------------|---------------------------------------------------------------|
| 1 | `git diff HEAD`         | You changed `package.json` but haven't staged it yet          |
| 2 | `git diff --cached`     | You staged the change but haven't committed                   |
| 3 | `git diff HEAD~1 HEAD`  | The version bump is in the most recent commit                 |
| 4 | `node_modules` mismatch | Installed version differs from what `package.json` declares   |
| 5 | `package-lock.json`     | Lock file version differs from `package.json`                 |

If multiple packages changed, segfault lists all of them and analyzes the first. Use `--package` to target a specific one.

### Testing auto-detect

```bash
# In any git-tracked project:
cd my-project

# Bump a dependency
npm install react@19

# Run segfault — it auto-detects the react 18→19 change
npx segfault
```

> **Note:** Auto-detect requires a **git repository**. The `demo-app/` directory is not a git repo, so you must pass `--package`, `--from`, and `--to` explicitly (or use `--demo`).

---

## CLI Options

```
Usage: segfault [options]

Options:
  -p, --package <name>     Package name (e.g. react)
  -f, --from <version>     Previous version (e.g. 18.3.1)
  -t, --to <version>       New version (e.g. 19.0.0)
  -c, --codebase <path>    Path to your codebase (default: ".")
  --json                   Output JSON instead of TUI
  --changelog <text>       Provide changelog text directly (skips fetch)
  --demo                   Use hardcoded React 19 breaking changes (no API key needed)
  -V, --version            Output the version number
  -h, --help               Display help
```

---

## TUI Controls

```
 ↑ ↓        Navigate within a pane
 Tab        Switch between Breaking Changes / Callsites panes
 Enter      Open the selected callsite in $EDITOR
 e          Export a markdown report
 q          Quit
```

The active pane is highlighted with a bright border. The bottom pane shows a code preview with the affected line marked.

---

## Output Modes

### Interactive TUI (default)
```bash
npx segfault --package react --from 18.3.1 --to 19.0.0 --codebase ./my-app
```

### JSON output (for CI/scripts)
```bash
npx segfault --package react --from 18.3.1 --to 19.0.0 --codebase ./my-app --json > report.json
```

### Markdown report (from TUI)
Press `e` inside the TUI to export a `segfault-report-<pkg>-<version>.md` file.

---

## Environment Variables

| Variable        | Required | Description                                       |
|-----------------|----------|---------------------------------------------------|
| `GEMINI_API_KEY`| Yes*     | Google Gemini API key for breaking change extraction |
| `GITHUB_TOKEN`  | No       | GitHub token for higher API rate limits on changelog fetch |
| `EDITOR`        | No       | Editor for "open in editor" (`vi` by default)     |

*Not required when using `--demo` mode.

---

## Project Structure

```
segfault/
├── src/
│   ├── index.ts       # CLI entrypoint
│   ├── detect.ts      # Stage 1: version change detection
│   ├── fetch.ts       # Stage 2: changelog fetching
│   ├── extract.ts     # Stage 3: LLM breaking change extraction
│   ├── analyze.ts     # Stage 4: static analysis
│   ├── tui.ts         # Stage 5: interactive TUI
│   └── types.ts       # Shared TypeScript types
├── tests/
│   ├── detect.test.ts
│   └── analyze.test.ts
├── demo-app/          # Sample React 18 app for testing
│   └── src/
│       ├── index.tsx
│       ├── main.tsx
│       ├── App.tsx
│       ├── Dashboard.tsx
│       ├── Settings.tsx
│       ├── ssr.tsx
│       └── utils/
│           ├── notifications.tsx
│           └── testHelpers.tsx
├── package.json
├── tsconfig.json
├── README.md
└── INSTALL.md
```

---

## Tech Stack

| Layer     | Choice                                   |
|-----------|------------------------------------------|
| Language  | TypeScript (Node.js)                     |
| CLI       | `commander`                              |
| LLM       | Gemini via `@google/generative-ai`       |
| AST       | `@typescript-eslint/typescript-estree`   |
| TUI       | `blessed`                                |
| Styling   | `chalk` + `ora`                          |

---

## License

MIT
