import { parsePackageJsonDiff, detectFromFlags, detectFromGitDiff } from '../src/detect';

describe('detect', () => {
    it('parses a git diff of package.json to extract version delta', () => {
        const diff = `
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -5,7 +5,7 @@
   "dependencies": {
-    "react": "^18.3.1",
+    "react": "^19.0.0",
     "react-dom": "^18.3.1"
`;
        const deltas = parsePackageJsonDiff(diff);
        expect(deltas).toHaveLength(1);
        expect(deltas[0]).toEqual({
            name: 'react',
            fromVersion: '18.3.1',
            toVersion: '19.0.0',
        });
    });

    it('extracts multiple package changes from a single diff', () => {
        const diff = `
-    "react": "^18.3.1",
+    "react": "^19.0.0",
-    "react-dom": "^18.3.1",
+    "react-dom": "^19.0.0",
`;
        const deltas = parsePackageJsonDiff(diff);
        expect(deltas).toHaveLength(2);
        expect(deltas[0].name).toBe('react');
        expect(deltas[1].name).toBe('react-dom');
    });

    it('returns empty array when no version changes found', () => {
        const diff = `
diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@ -1,3 +1,4 @@
+  "new-dep": "^1.0.0",
`;
        const deltas = parsePackageJsonDiff(diff);
        expect(deltas).toHaveLength(0);
    });

    it('ignores same-version lines (no actual change)', () => {
        const diff = `
-    "react": "^18.3.1",
+    "react": "^18.3.1",
`;
        const deltas = parsePackageJsonDiff(diff);
        expect(deltas).toHaveLength(0);
    });

    it('builds a delta from explicit flags', () => {
        const delta = detectFromFlags('react', '18.3.1', '19.0.0');
        expect(delta).toEqual({
            name: 'react',
            fromVersion: '18.3.1',
            toVersion: '19.0.0',
        });
    });

    it('throws a helpful error when auto-detect finds nothing in a non-git dir', () => {
        // /tmp is not a git repo and has no package.json — should throw
        expect(() => detectFromGitDiff('/tmp')).toThrow(/Pass versions explicitly/);
    });
});
