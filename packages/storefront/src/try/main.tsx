import '../styles.css';
import './try.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { controlledByWorker } from '../worker/register.js';
import { STORE_PARAM } from '../worker/storage.js';
import { TryPage } from './TryPage.jsx';

/**
 * The page at try/, for a visitor's own catalog. It registers the site's
 * worker again, under this page's own path, as the store for a visitor's
 * catalog, and waits until that worker, not the demo's, is in charge.
 */
const site = import.meta.env.BASE_URL;
const base = `${site}try/`;
const root = document.getElementById('root');
if (!root) throw new Error('the page has no root element');

const ready = import.meta.env.DEV
    ? Promise.reject(new Error('the page for your own catalog runs on the built site'))
    : controlledByWorker(`${site}sw.js?${STORE_PARAM}=try`, base);

createRoot(root).render(
    <StrictMode>
        <TryPage ready={ready} base={base} />
    </StrictMode>
);
