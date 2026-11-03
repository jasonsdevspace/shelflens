import type { Catalog } from '@shelflens/catalog';

/**
 * The catalog a visitor loaded, kept in IndexedDB by the worker for the page
 * at `try/`, which builds its store from this rather than from a file the
 * site ships. One record under one key: the catalog, or nothing before a
 * visitor loads one and after they remove it. Clearing the site's data in
 * the browser removes it with everything else.
 */

/** Where the worker keeps a visitor's catalog. */
export interface CatalogStore {
    current(): Promise<Catalog | undefined>;
    replace(catalog: Catalog): Promise<void>;
    clear(): Promise<void>;
}

export const CATALOG_DB_NAME = 'shelflens-try-catalog';
const STORE_NAME = 'catalog';
const KEY = 'loaded';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
    new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('the request failed'));
    });

const done = (transaction: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('the write failed'));
        transaction.onabort = () => reject(transaction.error ?? new Error('the write aborted'));
    });

const open = (name: string): Promise<IDBDatabase> => {
    const opening = indexedDB.open(name, 1);
    opening.onupgradeneeded = () => {
        opening.result.createObjectStore(STORE_NAME);
    };
    return request(opening);
};

export const createIndexedDbCatalogStore = (name = CATALOG_DB_NAME): CatalogStore => {
    let db: Promise<IDBDatabase> | undefined;
    const database = () => {
        db ??= open(name).catch((error: unknown) => {
            db = undefined;
            throw error;
        });
        return db;
    };
    const write = async (act: (store: IDBObjectStore) => void) => {
        const transaction = (await database()).transaction(STORE_NAME, 'readwrite');
        act(transaction.objectStore(STORE_NAME));
        await done(transaction);
    };
    return {
        current: async () => {
            const store = (await database()).transaction(STORE_NAME).objectStore(STORE_NAME);
            return (await request(store.get(KEY))) as Catalog | undefined;
        },
        replace: (catalog) => write((store) => store.put(catalog, KEY)),
        clear: () => write((store) => store.delete(KEY)),
    };
};

/** The same in memory, for the tests and anything without IndexedDB. */
export const createMemoryCatalogStore = (initial?: Catalog): CatalogStore => {
    let kept = initial;
    return {
        current: () => Promise.resolve(kept),
        replace: (catalog) => {
            kept = catalog;
            return Promise.resolve();
        },
        clear: () => {
            kept = undefined;
            return Promise.resolve();
        },
    };
};
