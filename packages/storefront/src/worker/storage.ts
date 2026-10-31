import { CATALOG_DB_NAME } from './catalog-db.js';
import { DEFAULT_DB_NAME as EVENTS_DB_NAME } from './event-db.js';
import { DEFAULT_DB_NAME as RULES_DB_NAME } from './rule-db.js';

/**
 * Which store a worker serves, and the names of what it keeps.
 *
 * The same worker script serves the demo and, registered again under the
 * scope `try/` with `?store=try`, a visitor's own catalog. A cache or a
 * database is named for the whole site, not for a worker's scope, so the
 * two would share them unless each has its own names. The demo keeps the
 * names it always had, so a returning visitor keeps what they saved, and
 * the visitor's store has its own, so nothing loaded there can reach the
 * demo, a rule saved against a visitor's products included.
 */

export type StoreKind = 'demo' | 'try';

/** The query parameter a worker is registered with to serve a visitor's catalog. */
export const STORE_PARAM = 'store';

export const storeKindOf = (scriptUrl: string): StoreKind =>
    new URL(scriptUrl).searchParams.get(STORE_PARAM) === 'try' ? 'try' : 'demo';

export interface StorageNames {
    readonly answers: string;
    readonly events: string;
    readonly rules: string;
    /** Only a visitor's store keeps a catalog. The demo downloads its own. */
    readonly catalog?: string;
}

export const storageFor = (kind: StoreKind): StorageNames =>
    kind === 'try'
        ? {
              answers: 'shelflens-try-answers',
              events: 'shelflens-try-events',
              rules: 'shelflens-try-rules',
              catalog: CATALOG_DB_NAME,
          }
        : { answers: 'shelflens-answers', events: EVENTS_DB_NAME, rules: RULES_DB_NAME };
