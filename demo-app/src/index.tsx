import React from 'react';
import ReactDOM from 'react-dom';

function App() {
    return <div>Entry point</div>;
}

// This will break in React 19 — ReactDOM.render is removed
ReactDOM.render(<App />, document.getElementById('root'));
