import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';

import { storeInfoOf, StoreProvider } from '../app/StoreContext.jsx';
import { useQuery } from '../app/useQuery.js';
import { createClient, type CustomerGroup } from '../client/graphql.js';
import { StoreDocument } from '../generated/operations.js';
import searchbox from '../search/searchbox.css?inline';
import { SearchBox } from '../search/SearchBox.jsx';
import frame from './widget.css?inline';

/**
 * The search box as a widget for a host page.
 *
 * The widget mounts into an element the host hands it, inside a shadow
 * root of its own, with its own stylesheet and its own React, so the host
 * page's CSS cannot reach it and its React, of any version, is never
 * touched. The popover opens in the browser's top layer, over anything the
 * host stacks or clips. The host says where the API is and where its store
 * is, and may say what to do with a search or a product instead.
 */

export interface MountOptions {
    /** Where the store's API answers. */
    readonly apiUrl: string;
    /** The store's page, which a search or a product opens unless the host says otherwise. */
    readonly storeUrl: string;
    readonly group?: CustomerGroup;
    readonly onSearch?: (phrase: string) => void;
    readonly onPick?: (sku: string) => void;
    readonly placeholder?: string;
}

/** Opens the store with one parameter set, whatever query or fragment the store's URL carries. */
const openStore = (storeUrl: string, key: string, value: string) => {
    const url = new URL(storeUrl, window.location.href);
    url.searchParams.set(key, value);
    window.location.assign(url.href);
};

const Widget = ({ apiUrl, storeUrl, group, onSearch, onPick, placeholder }: MountOptions) => {
    const client = useMemo(
        () => createClient({ url: apiUrl, ...(group && { group }) }),
        [apiUrl, group]
    );
    const store = useQuery(client, StoreDocument, {});
    const info = useMemo(() => storeInfoOf(store.data), [store.data]);
    return (
        <StoreProvider value={info}>
            <SearchBox
                client={client}
                {...(placeholder !== undefined && { placeholder })}
                onSearch={onSearch ?? ((phrase) => openStore(storeUrl, 'q', phrase))}
                onPick={onPick ?? ((sku) => openStore(storeUrl, 'product', sku))}
            />
        </StoreProvider>
    );
};

/** Gives the shadow root its sheet, as a constructed sheet where the browser has them, and answers with the way to take it off. */
const dress = (shadow: ShadowRoot, css: string): (() => void) => {
    if ('adoptedStyleSheets' in shadow && 'replaceSync' in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
        return () => {
            shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter((kept) => kept !== sheet);
        };
    }
    const style = document.createElement('style');
    style.textContent = css;
    shadow.append(style);
    return () => style.remove();
};

/**
 * Mounts the search box into the element and answers with the way to take
 * it out again, which a host built on React calls from its effect's cleanup.
 */
export const mountShelfLens = (element: HTMLElement, options: MountOptions): (() => void) => {
    const shadow = element.shadowRoot ?? element.attachShadow({ mode: 'open' });
    // Set on the element itself, where a host rule on the element would otherwise win,
    // and put back on the way out, so the element is the host's again.
    const wasDisplayed = element.style.getPropertyValue('display');
    element.style.setProperty('display', 'block');
    const undress = dress(shadow, `${frame}\n${searchbox}`);
    const container = document.createElement('div');
    container.className = 'shelflens';
    shadow.append(container);
    const root = createRoot(container);
    root.render(
        <StrictMode>
            <Widget {...options} />
        </StrictMode>
    );
    return () => {
        root.unmount();
        container.remove();
        undress();
        element.style.setProperty('display', wasDisplayed);
    };
};
