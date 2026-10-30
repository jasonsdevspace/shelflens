import { generateCatalog } from '@shelflens/catalog';
import { fireEvent, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createWorkerApi } from '../worker/handle.js';
import { serving } from '../worker/serving.js';
import { mountShelfLens } from './index.jsx';

/*
 * The widget in a host document, over the real API, as the host page
 * mounts it: into an element of the host's, inside a shadow root of the
 * widget's own.
 */

const catalog = generateCatalog({ seed: 42, products: 120 });

beforeAll(() => {
    const worker = createWorkerApi({
        catalogUrl: 'catalog.json',
        rulesUrl: 'rules.json',
        fetch: serving(catalog, { rules: [] }),
    });
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const response = await worker.handle(new Request(input, init));
        return response ?? new Response('not found', { status: 404 });
    });
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('the widget', () => {
    it('mounts the box in a shadow root of its own, with its own sheet, and takes it out again', async () => {
        const host = document.createElement('div');
        host.id = 'search';
        document.body.append(host);
        const onSearch = vi.fn();
        const unmount = mountShelfLens(host, {
            apiUrl: 'http://store.test/graphql',
            storeUrl: '/',
            onSearch,
        });
        const inside = host.shadowRoot?.querySelector('.shelflens');
        if (!(inside instanceof HTMLElement))
            throw new Error('expected the widget in a shadow root');
        // The host's document sees no box, only the element it handed over.
        expect(document.querySelector('[role="combobox"]')).toBeNull();
        // The root renders when React gets to it, which is a moment after the mount.
        const box = await within(inside).findByRole('combobox', { name: 'Search the store' });
        expect(host.style.display).toBe('block');
        expect(host.shadowRoot?.querySelector('style')).not.toBeNull();

        // A simulated user types at the document, which does not see into the shadow
        // tree, so the keystrokes go to the box as events.
        fireEvent.focus(box);
        fireEvent.change(box, { target: { value: 'jacket' } });
        expect((await within(inside).findAllByRole('option')).length).toBeGreaterThan(0);
        expect(box).toHaveAttribute('aria-expanded', 'true');
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(onSearch).toHaveBeenCalledWith('jacket');

        unmount();
        expect(host.shadowRoot?.querySelector('[role="combobox"]')).toBeNull();
    });

    it('opens the store on a search or a product when the host says nothing else', async () => {
        const host = document.createElement('div');
        document.body.append(host);
        const assign = vi.fn();
        vi.stubGlobal('location', { ...window.location, assign });
        mountShelfLens(host, { apiUrl: 'http://store.test/graphql', storeUrl: '/store/' });
        const inside = host.shadowRoot?.querySelector('.shelflens');
        if (!(inside instanceof HTMLElement))
            throw new Error('expected the widget in a shadow root');
        // The root renders when React gets to it, which is a moment after the mount.
        const box = await within(inside).findByRole('combobox', { name: 'Search the store' });
        fireEvent.change(box, { target: { value: 'rain jacket' } });
        fireEvent.keyDown(box, { key: 'Enter' });
        expect(assign).toHaveBeenCalledWith('/store/?q=rain%20jacket');
        vi.unstubAllGlobals();
    });
});
