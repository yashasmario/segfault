import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { findCallsites } from '../src/analyze';
import { BreakingChange } from '../src/types';

const FIXTURE_REACT_DOM_RENDER: BreakingChange = {
    kind: 'removed',
    symbol: 'ReactDOM.render',
    module: 'react-dom',
    description: 'ReactDOM.render was removed in React 19',
};

const FIXTURE_UNMOUNT: BreakingChange = {
    kind: 'removed',
    symbol: 'unmountComponentAtNode',
    module: 'react-dom',
    description: 'unmountComponentAtNode was removed',
};

describe('analyze', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'segfault-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('finds callsites for a removed API', async () => {
        const code = `
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));
`;
        fs.writeFileSync(path.join(tmpDir, 'index.tsx'), code);

        const results = await findCallsites(tmpDir, [FIXTURE_REACT_DOM_RENDER]);
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].change.symbol).toBe('ReactDOM.render');
        expect(results[0].confidence).toBe('high');
    });

    it('returns empty when symbol is not used', async () => {
        const code = `console.log("hello world");\n`;
        fs.writeFileSync(path.join(tmpDir, 'clean.ts'), code);

        const results = await findCallsites(tmpDir, [FIXTURE_REACT_DOM_RENDER]);
        expect(results).toHaveLength(0);
    });

    it('skips node_modules directory', async () => {
        const nmDir = path.join(tmpDir, 'node_modules', 'some-pkg');
        fs.mkdirSync(nmDir, { recursive: true });
        fs.writeFileSync(path.join(nmDir, 'index.js'), `ReactDOM.render(x, y);`);

        const results = await findCallsites(tmpDir, [FIXTURE_REACT_DOM_RENDER]);
        expect(results).toHaveLength(0);
    });

    it('detects multiple symbols in the same file', async () => {
        const code = `
import ReactDOM from 'react-dom';
import { unmountComponentAtNode } from 'react-dom';
ReactDOM.render(<App />, root);
unmountComponentAtNode(root);
`;
        fs.writeFileSync(path.join(tmpDir, 'multi.tsx'), code);

        const results = await findCallsites(tmpDir, [FIXTURE_REACT_DOM_RENDER, FIXTURE_UNMOUNT]);
        expect(results.length).toBeGreaterThanOrEqual(2);
        const symbols = results.map(r => r.change.symbol);
        expect(symbols).toContain('ReactDOM.render');
        expect(symbols).toContain('unmountComponentAtNode');
    });
});
