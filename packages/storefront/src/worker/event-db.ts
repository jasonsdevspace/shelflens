import { EVENT_LIMIT, type EventStore, type StoreEvent } from '@shelflens/api';

/**
 * Events kept in IndexedDB, which is what a service worker has.
 *
 * The worker is stopped after a few seconds idle, so anything it keeps in
 * memory is gone between a shopper's clicks. IndexedDB outlives it, and
 * the page shares it, so a browser test can look at what arrived. Each
 * event is stored under its id, and storing an id again replaces the
 * same event, which is how a batch delivered twice counts once. Past the
 * limit the oldest go, by the time the page gave them.
 */

/** The demo's database. The page for a visitor's own catalog names its own. */
export const DEFAULT_DB_NAME = 'shelflens-events';
const STORE_NAME = 'events';
const BY_TIME = 'at';

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

const openAt = (name: string, version?: number): Promise<IDBDatabase> => {
    const opening = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    opening.onupgradeneeded = () => {
        const store = opening.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(BY_TIME, 'at');
    };
    return request(opening);
};

/**
 * Opens the database with its store in place. Anything else on the origin
 * that opened the name first, such as a test reading what arrived, made
 * it empty, and a store can only be added on a version change, so in that
 * case the database is opened again one version up.
 */
const open = async (name: string): Promise<IDBDatabase> => {
    const db = await openAt(name);
    if (db.objectStoreNames.contains(STORE_NAME)) return db;
    const next = db.version + 1;
    db.close();
    return openAt(name, next);
};

/** Removes the oldest events until the store is within its limit. */
const trim = async (store: IDBObjectStore, limit: number) => {
    const count = await request(store.count());
    let excess = count - limit;
    if (excess <= 0) return;
    await new Promise<void>((resolve, reject) => {
        const walk = store.index(BY_TIME).openCursor();
        walk.onerror = () => reject(walk.error ?? new Error('the trim failed'));
        walk.onsuccess = () => {
            const cursor = walk.result;
            if (!cursor || excess <= 0) {
                resolve();
                return;
            }
            cursor.delete();
            excess -= 1;
            cursor.continue();
        };
    });
};

export interface IndexedDbEventStoreOptions {
    readonly limit?: number;
    /** The database to keep them in. */
    readonly name?: string;
}

export const createIndexedDbEventStore = ({
    limit = EVENT_LIMIT,
    name = DEFAULT_DB_NAME,
}: IndexedDbEventStoreOptions = {}): EventStore & { clear(): Promise<void> } => {
    let db: Promise<IDBDatabase> | undefined;
    const database = () => {
        db ??= open(name).catch((error: unknown) => {
            db = undefined;
            throw error;
        });
        return db;
    };
    return {
        append: async (events) => {
            const transaction = (await database()).transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            for (const event of events) store.put(event);
            await trim(store, limit);
            await done(transaction);
        },
        clear: async () => {
            const transaction = (await database()).transaction(STORE_NAME, 'readwrite');
            transaction.objectStore(STORE_NAME).clear();
            await done(transaction);
        },
        all: async () => {
            const store = (await database()).transaction(STORE_NAME).objectStore(STORE_NAME);
            return request(store.index(BY_TIME).getAll()) as Promise<StoreEvent[]>;
        },
    };
};
