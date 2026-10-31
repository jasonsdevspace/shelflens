import type { Rule } from '@jasonsdevspace/shelflens';
import type { RuleStore } from '@shelflens/api';

/**
 * The rules a visitor saved, kept in IndexedDB, which is what a service
 * worker has, in a database of its own so the events database never has
 * to migrate for it. One record under one key: the whole set, or nothing
 * when the shipped file is in effect.
 */

/** The demo's database. The page for a visitor's own catalog names its own. */
export const DEFAULT_DB_NAME = 'shelflens-rules';
const STORE_NAME = 'rules';
const KEY = 'saved';

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
        opening.result.createObjectStore(STORE_NAME);
    };
    return request(opening);
};

/** Opens the database with its store in place, one version up if someone else made it empty. */
const open = async (name: string): Promise<IDBDatabase> => {
    const db = await openAt(name);
    if (db.objectStoreNames.contains(STORE_NAME)) return db;
    const next = db.version + 1;
    db.close();
    return openAt(name, next);
};

export const createIndexedDbRuleStore = (name = DEFAULT_DB_NAME): RuleStore => {
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
            const kept = (await request(store.get(KEY))) as readonly Rule[] | undefined;
            return kept;
        },
        replace: (rules) => write((store) => store.put(rules, KEY)),
        reset: () => write((store) => store.delete(KEY)),
    };
};
