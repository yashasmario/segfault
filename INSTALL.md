# Installation Guide

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- **Git** (for auto-detect to work)

---

## 1. Clone & Install

```bash
git clone <repo-url> segfault
cd segfault
npm install
```

---

## 2. Build

```bash
npm run build
```

This compiles TypeScript from `src/` into `dist/`.

For development with auto-rebuild:
```bash
npm run dev
```

---

## 3. Set Up Gemini API Key

segfault uses Google's Gemini API to extract breaking changes from changelogs.

1. Get a free API key at [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Export it:

```bash
export GEMINI_API_KEY=your_key_here
```

Add it to your shell profile (`~/.zshrc`, `~/.bashrc`) to persist it:

```bash
echo 'export GEMINI_API_KEY=your_key_here' >> ~/.zshrc
```

> **Tip:** You can skip this entirely by using `--demo` mode for testing.

---

## 4. Verify Installation

### Demo mode (no API key needed)

```bash
node dist/index.js --package react --from 18.3.1 --to 19.0.0 --codebase ./demo-app --demo
```

Expected output:
```
✔ react  18.3.1 → 19.0.0
  ✔ Injected 4 React 19 breaking changes
  · [removed] ReactDOM.render
  · [removed] unmountComponentAtNode
  · [import_changed] createRoot
  · [removed] ReactDOM.hydrate
✔ Found 19 callsites across your codebase
→ TUI launches
```

### With Gemini (requires API key)

```bash
node dist/index.js --package react --from 18.3.1 --to 19.0.0 --codebase ./demo-app
```

### Run tests

```bash
npm test
```

Expected: 10 tests pass.

---

## 5. Optional: Global Install

To use `segfault` as a global command:

```bash
npm link
```

Then from any project:

```bash
segfault --package lodash --from 4.17.21 --to 5.0.0 --codebase .
```

---

## 6. Optional: GitHub Token

If you hit GitHub API rate limits when fetching changelogs, set a token:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

This is only needed for heavy usage — anonymous requests allow 60/hour.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `GEMINI_API_KEY not set` | Export the key or use `--demo` |
| `429 Too Many Requests` | Free tier quota hit — wait 1 min or switch API key |
| `Not a git repository` | Auto-detect needs git. Use `--package`/`--from`/`--to` instead |
| `No dependency changes detected` | Make sure `package.json` has changed in git. Try: `git diff HEAD -- package.json` |
| Build errors | Run `npm install` then `npm run build` |
