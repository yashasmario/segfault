import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom';  // wrong import path — should be react-dom/client in React 19

/**
 * Settings panel component. 
 * Note: createRoot is imported from 'react-dom' which is the old path.
 * In React 19, it must come from 'react-dom/client'.
 */
export function Settings() {
    const [theme, setTheme] = useState('dark');
    const [fontSize, setFontSize] = useState(14);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <div className="settings-panel">
            <h2>Settings</h2>
            <label>
                Theme:
                <select value={theme} onChange={e => setTheme(e.target.value)}>
                    <option value="dark">Dark</option>
                    <option value="light">Light</option>
                </select>
            </label>
            <label>
                Font Size:
                <input
                    type="range"
                    min={10}
                    max={24}
                    value={fontSize}
                    onChange={e => setFontSize(Number(e.target.value))}
                />
                <span>{fontSize}px</span>
            </label>
        </div>
    );
}

// Mount settings into a sidebar container using the wrong import
export function mountSettings(container: HTMLElement) {
    const root = createRoot(container);
    root.render(<Settings />);
    return root;
}
