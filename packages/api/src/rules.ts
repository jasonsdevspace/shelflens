import type { Rule } from '@jasonsdevspace/shelflens';

import { parseRulesFile } from './rules-file.js';

/**
 * The merchandising rules a visitor has saved, and where they land.
 *
 * The store ships a rules file. A merchandiser in the demo edits the set
 * and saves it, and from then on the saved set stands in for the file,
 * wholesale, until it is reset. The set lives with the host that runs the
 * engine, in IndexedDB inside the worker and in memory on the Node
 * server, behind one interface, and it reaches the host on a plain
 * `rules` path beside `graphql`: a `GET` answers the current set and
 * whether it is the shipped one, a `POST` replaces it, a `DELETE` puts the
 * file back. A mutation would need a hole in the persisted-only rule the
 * public demo keeps, as decision 9 says of events.
 *
 * A set is checked by the engine before it is kept, through the same
 * check a preview runs, so what the panel saw in the preview is what the
 * store is built with. The host builds the store again as a new version
 * on every change and answers only once it has, so the next search
 * cannot land on the old one.
 */

/** Where a host keeps the saved set. Nothing when the shipped file is in effect. */
export interface RuleStore {
    current(): Promise<readonly Rule[] | undefined>;
    replace(rules: readonly Rule[]): Promise<void>;
    reset(): Promise<void>;
}

export const createMemoryRuleStore = (): RuleStore => {
    let kept: readonly Rule[] | undefined;
    return {
        current: () => Promise.resolve(kept),
        replace: (rules) => {
            kept = rules;
            return Promise.resolve();
        },
        reset: () => {
            kept = undefined;
            return Promise.resolve();
        },
    };
};

/** Whether a URL is for the rules: `rules` under the host's base. */
export const isRulesPath = (url: string, base = '/'): boolean =>
    new URL(url, 'http://local').pathname === `${base}rules`;

export interface RulesRequest {
    readonly method: string;
    readonly body?: string | undefined;
}

export interface RulesReceipt {
    readonly status: number;
    /** The current set, on a read. */
    readonly body?: { readonly rules: readonly Rule[]; readonly edited: boolean };
    readonly message?: string;
    /** Whether the set changed, so the host builds the store again. */
    readonly changed: boolean;
}

export interface RulesHost {
    /** The rules the store ships, in effect when nothing is saved. */
    readonly shipped: readonly Rule[];
    /** Refuses a set the engine would refuse, with the engine's own words. */
    check(rules: readonly Rule[]): void;
}

/** What the rules path answers, shared by every host. */
export const receiveRules = async (
    request: RulesRequest,
    store: RuleStore,
    host: RulesHost
): Promise<RulesReceipt> => {
    if (request.method === 'GET') {
        const saved = await store.current();
        return {
            status: 200,
            body: { rules: saved ?? host.shipped, edited: saved !== undefined },
            changed: false,
        };
    }
    if (request.method === 'DELETE') {
        const had = (await store.current()) !== undefined;
        await store.reset();
        return { status: 204, changed: had };
    }
    if (request.method !== 'POST') {
        return { status: 405, message: 'the rules are read, posted or deleted', changed: false };
    }
    let rules: readonly Rule[];
    try {
        rules = parseRulesFile(JSON.parse(request.body ?? ''));
        host.check(rules);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'the rules could not be read';
        return { status: 400, message, changed: false };
    }
    await store.replace(rules);
    return { status: 204, changed: true };
};
