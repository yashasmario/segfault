import React from 'react';
import ReactDOM from 'react-dom';

/**
 * Utility to render a notification toast into a temporary container.
 * Uses ReactDOM.render (removed in React 19) to mount into a detached DOM node.
 */
export function showToast(message: string, duration = 3000) {
    const container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);

    // ReactDOM.render — this is the old API, removed in React 19
    ReactDOM.render(
        <div className="toast" role="alert">
            <span className="toast-icon">⚠️</span>
            <span className="toast-message">{message}</span>
        </div>,
        container
    );

    setTimeout(() => {
        // unmountComponentAtNode — also removed in React 19
        ReactDOM.unmountComponentAtNode(container);
        document.body.removeChild(container);
    }, duration);
}

/**
 * Renders a confirmation dialog using the old ReactDOM.render pattern.
 */
export function showConfirmDialog(
    title: string,
    message: string,
    onConfirm: () => void,
    onCancel: () => void,
) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    document.body.appendChild(overlay);

    function cleanup() {
        ReactDOM.unmountComponentAtNode(overlay);
        document.body.removeChild(overlay);
    }

    ReactDOM.render(
        <div className="confirm-dialog">
            <h2>{title}</h2>
            <p>{message}</p>
            <div className="dialog-actions">
                <button onClick={() => { cleanup(); onCancel(); }}>Cancel</button>
                <button onClick={() => { cleanup(); onConfirm(); }}>Confirm</button>
            </div>
        </div>,
        overlay
    );
}
