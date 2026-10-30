import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { controlledByWorker } from '../worker/register.js';
import type { mountShelfLens } from './index.jsx';

/**
 * The host page's side of the widget demo: a React of its own on the
 * page, the worker registered the way the store registers it, and the
 * built widget loaded as a host would load it, from its own file.
 */

const base = import.meta.env.BASE_URL;

/** The host page's own React, counting, to show the widget's React leaves it alone. */
const Counter = () => {
    const [count, setCount] = useState(0);
    return (
        <div className="host-counter">
            <button type="button" onClick={() => setCount(count + 1)}>
                Count
            </button>
            <span aria-live="polite">This page&rsquo;s own React has counted {count}</span>
        </div>
    );
};

const hostApp = document.getElementById('host-app');
if (hostApp) {
    createRoot(hostApp).render(
        <StrictMode>
            <Counter />
        </StrictMode>
    );
}

/** The widget from the file the build ships, or from its source in development. */
const widget = (): Promise<{ mountShelfLens: typeof mountShelfLens }> =>
    import.meta.env.DEV
        ? import('./index.jsx')
        : import(/* @vite-ignore */ new URL('widget.js', `${window.location.origin}${base}`).href);

const target = document.getElementById('shelflens-search');
if (!target) throw new Error('the page has no element for the search box');

// In development the dev server answers the API. In production the worker does,
// once it controls this page, which is under its scope like the store's own.
const ready = import.meta.env.DEV ? Promise.resolve() : controlledByWorker(`${base}sw.js`, base);
Promise.all([ready, widget()])
    .then(([, { mountShelfLens }]) => {
        mountShelfLens(target, { apiUrl: `${base}graphql`, storeUrl: base });
    })
    .catch((failure: unknown) => {
        // A browser without a service worker, or a file that did not arrive: said in place,
        // and the reason told apart, since one is the browser's and the other the page's.
        const notice = document.createElement('p');
        notice.className = 'notice';
        notice.setAttribute('role', 'alert');
        const noWorker = failure instanceof Error && failure.message.includes('service worker');
        notice.textContent = noWorker
            ? 'The search box could not start in this browser. It needs a service worker.'
            : 'The search box could not be loaded on this page. Reload the page and try again.';
        target.replaceChildren(notice);
        console.error(failure);
    });
