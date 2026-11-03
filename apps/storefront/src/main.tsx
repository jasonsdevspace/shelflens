import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.jsx';
import { controlledByWorker } from './worker/register.js';

const base = import.meta.env.BASE_URL;
const root = document.getElementById('root');
if (!root) throw new Error('the page has no root element');

const render = (ready: Promise<void>) => {
    createRoot(root).render(
        <StrictMode>
            <App
                apiUrl={`${base}graphql`}
                eventsUrl={`${base}events`}
                rulesUrl={`${base}rules`}
                ready={ready}
            />
        </StrictMode>
    );
};

// In development the dev server answers the API. In production the worker does.
render(import.meta.env.DEV ? Promise.resolve() : controlledByWorker(`${base}sw.js`, base));
