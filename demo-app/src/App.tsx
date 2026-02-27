import React from 'react';
import { unmountComponentAtNode } from 'react-dom';

export function App() {
    return <div>Hello World</div>;
}

// unmountComponentAtNode is also removed in React 19
export function cleanup(container: Element) {
    unmountComponentAtNode(container);
}
