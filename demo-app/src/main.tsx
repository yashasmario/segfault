import React from 'react';
import ReactDOM from 'react-dom';
import App from './App';

// Another file using ReactDOM.render — both should be surfaced
ReactDOM.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
    document.getElementById('root')
);
