import React from 'react';
import ReactDOM from 'react-dom';

// Server-side rendering entry point using ReactDOM.hydrate
// This is removed in React 19 — use hydrateRoot from react-dom/client

function ServerApp() {
    return (
        <html>
            <body>
                <div id="app">
                    <h1>Server-rendered App</h1>
                </div>
            </body>
        </html>
    );
}

const container = document.getElementById('app');
ReactDOM.hydrate(<ServerApp />, container);
