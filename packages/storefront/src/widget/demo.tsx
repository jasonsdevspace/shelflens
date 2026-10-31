import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { controlledByWorker } from '../worker/register.js';
import { hostConfig, storeOf } from './host-config.js';
import type { mountShelfLens } from './index.jsx';

/**
 * A host page's side of the widget demo: a React of its own on the page, the
 * worker registered the way the store registers it, and the built widget
 * loaded as a host would load it, from its own file. The page says which store
 * it searches, the demo's or a visitor's own, in its body's `data-store`.
 */

const base = import.meta.env.BASE_URL;
const store = storeOf(document.body.dataset['store']);
const config = hostConfig(base, store);

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

/** Said in place of the box, as a host page would say it. */
const say = (
    text: string,
    {
        link,
        role = 'alert',
    }: { link?: { readonly href: string; readonly label: string }; role?: string } = {}
) => {
    const notice = document.createElement('p');
    notice.className = 'notice';
    // A failure interrupts, and an empty store is only said.
    notice.setAttribute('role', role);
    notice.textContent = text;
    if (link) {
        const anchor = document.createElement('a');
        anchor.href = link.href;
        anchor.textContent = link.label;
        notice.append(' ', anchor, '.');
    }
    target.replaceChildren(notice);
};

/** Whether the store this page searches has something to search. Only a visitor's can be empty. */
const hasCatalog = async (): Promise<boolean> => {
    if (config.catalogUrl === undefined) return true;
    const response = await fetch(config.catalogUrl);
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`the store answered ${response.status}`);
    return true;
};

// In development the dev server answers the demo's API. In production the worker
// does, once it controls this page, which is under its scope like the store's own.
const ready = import.meta.env.DEV
    ? store === 'demo'
        ? Promise.resolve()
        : Promise.reject(new Error('the page for your own catalog runs on the built site'))
    : controlledByWorker(config.scriptUrl, config.scope);
// The store is asked whether it has anything to search while the widget's file
// arrives, so an empty store is said without waiting for a box it will not use.
Promise.all([ready.then(hasCatalog), widget()])
    .then(([loaded, { mountShelfLens }]) => {
        if (!loaded) {
            say(
                'The search box here searches a file of your own products, and none is loaded yet.',
                {
                    link: { href: config.storeUrl, label: 'Choose a file' },
                    role: 'status',
                }
            );
            return;
        }
        mountShelfLens(target, { apiUrl: config.apiUrl, storeUrl: config.storeUrl });
    })
    .catch((failure: unknown) => {
        // A browser without a service worker, the dev server, or a file that did not
        // arrive: said in place, and the reason told apart, since only the last is
        // helped by reloading.
        const reason = failure instanceof Error ? failure.message : '';
        say(
            reason.includes('service worker')
                ? 'The search box could not start in this browser. It needs a service worker.'
                : reason.includes('built site')
                  ? 'The search box over your own products runs on the built site, not the dev server.'
                  : 'The search box could not be loaded on this page. Reload the page and try again.'
        );
        console.error(failure);
    });
