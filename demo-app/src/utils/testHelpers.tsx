import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Legacy test utilities — several of these APIs changed in React 19.
 */

// Helper to render a component for testing (uses ReactDOM.render)
export function renderForTest(component: React.ReactElement): HTMLDivElement {
    const container = document.createElement('div');
    document.body.appendChild(container);
    ReactDOM.render(component, container);
    return container;
}

// Clean up after test (uses unmountComponentAtNode)
export function cleanupTest(container: HTMLDivElement) {
    ReactDOM.unmountComponentAtNode(container);
    document.body.removeChild(container);
}

// Test that renders and hydrates (both APIs removed in React 19)
export function hydrateForTest(component: React.ReactElement, html: string): HTMLDivElement {
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    ReactDOM.hydrate(component, container);
    return container;
}
