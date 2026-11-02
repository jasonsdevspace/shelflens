import type { Rule } from '@jasonsdevspace/shelflens';
import type { Catalog } from '@shelflens/catalog';

import { withResponseCache } from './cache.js';
import { createStore, type Store } from './context.js';
import type { EventStore } from './events.js';
import { createStoreApi, type StoreApi } from './execute.js';
import { fingerprint } from './fingerprint.js';
import { receiveRules, type RulesReceipt, type RulesRequest, type RuleStore } from './rules.js';
import { type Signals, signalsOf } from './signals.js';

/**
 * The store as every host serves it: the service worker, the Node server
 * and the dev server alike, so the store a visitor's browser answers from
 * and the one `npm run api` answers from are built the same way.
 *
 * It builds the store the first time anything asks, from the catalog and
 * the rules its source gives, the rules a merchandiser saved in their
 * place, and the clicks collected so far. It builds again, as a new
 * version, when a visit begins after new clicks and when a set of rules is
 * saved or reset. One change happens at a time, in the order asked, so a
 * visit racing a save cannot finish out of order or undo the other. A
 * build over the same catalog keeps the index it already has and only
 * applies the rules and the clicks, which costs a reconfigure of the
 * engine rather than indexing every product again.
 *
 * What a host owns on its own stays with it: how requests arrive, where
 * answers are kept, and, for the page for a visitor's own catalog, where
 * that catalog is kept and how a new one replaces it.
 */

/** What a store is built from before anything is saved: the catalog and the rules it ships with. */
export interface StoreSource {
    readonly catalog: Catalog;
    readonly rules: readonly Rule[];
}

export interface StoreHostOptions {
    /** The catalog and the shipped rules, read once and kept until `forget` is called. */
    readonly source: () => Promise<StoreSource>;
    /** The events collected so far, whose clicks are folded into ranking. */
    readonly events?: EventStore | undefined;
    /** Where saved rules are kept. Without it, rules cannot be saved. */
    readonly rules?: RuleStore | undefined;
    /** Told of each store once it is the one served, as a worker drops answers kept for another. */
    readonly onServed?: ((api: StoreApi) => Promise<void>) | undefined;
}

/** A store as served: the API that answers, the model behind it, and what it was made from. */
export interface HostedStore {
    readonly api: StoreApi;
    readonly model: Store;
    readonly from: { readonly clicks: string; readonly rules: string; readonly catalog: string };
}

/** How long the first build took, for the cold visit measurement. */
export interface Startup {
    /** Reading the catalog and the rules, in milliseconds. */
    readonly downloadMs: number;
    /** Building the index and the completions from them, in milliseconds. */
    readonly buildMs: number;
}

/** What a request on the rules path is answered with, and the store version after a change. */
export type RulesAnswer = RulesReceipt & { readonly version?: string };

export interface StoreHost {
    /** The store being served, built the first time anything asks. */
    current(): Promise<HostedStore>;
    /** The store being served, or nothing when none has been built or the build failed. */
    served(): Promise<HostedStore | undefined>;
    /** A visit begins: builds again if the clicks changed since, and says whether it did. */
    refresh(): Promise<boolean>;
    /** Reads, replaces or resets the saved rules, building again on a change. */
    receiveRules(request: RulesRequest): Promise<RulesAnswer>;
    /**
     * Runs a change in its turn, with a way to build again inside it, for a
     * host's own changes such as loading a new catalog.
     */
    change<T>(task: (rebuild: () => Promise<HostedStore>) => Promise<T>): Promise<T>;
    /** Forgets the source and the store, so the next build reads the source again. */
    forget(): void;
    /** How long the first build took. */
    startup(): Startup;
}

export const createStoreHost = ({
    source,
    events,
    rules,
    onServed,
}: StoreHostOptions): StoreHost => {
    let store: Promise<HostedStore> | undefined;
    let read: Promise<StoreSource> | undefined;
    let timing: Startup = { downloadMs: 0, buildMs: 0 };

    const sourceNow = () => {
        read ??= source().catch((error: unknown) => {
            read = undefined;
            throw error;
        });
        return read;
    };

    /** How often each product was clicked, from everything collected so far. */
    const clicks = async (): Promise<Signals> => signalsOf(events ? await events.all() : []);

    /** What a build is made from, read together so the two are from one moment. */
    const inputs = async () => {
        const [signals, saved] = await Promise.all([clicks(), rules?.current()]);
        return { signals, saved };
    };

    const served = async (): Promise<HostedStore | undefined> =>
        store ? store.catch(() => undefined) : undefined;

    /** A store from the source, the rules in effect and these clicks, over the last index when it can. */
    const build = async (
        signals: Signals,
        saved: readonly Rule[] | undefined,
        basis: Store | undefined
    ): Promise<HostedStore> => {
        const began = performance.now();
        const { catalog, rules: shipped } = await sourceNow();
        const downloaded = performance.now();
        const model = createStore({
            catalog,
            rules: saved ?? shipped,
            rulesEdited: saved !== undefined,
            signals,
            basis,
        });
        const api = withResponseCache(createStoreApi(model, { events }));
        if (!basis)
            timing = { downloadMs: downloaded - began, buildMs: performance.now() - downloaded };
        return {
            api,
            model,
            from: {
                clicks: fingerprint(signals),
                rules: JSON.stringify(saved ?? null),
                catalog: catalog.version,
            },
        };
    };

    /**
     * Builds again, unless the store being served was made from the same
     * clicks, rules and catalog, as when a visit and a save arrive together.
     */
    const buildAgain = async (): Promise<HostedStore> => {
        const { signals, saved } = await inputs();
        const { catalog } = await sourceNow();
        const current = await served();
        const same =
            current?.from.clicks === fingerprint(signals) &&
            current.from.rules === JSON.stringify(saved ?? null) &&
            current.from.catalog === catalog.version;
        if (same) return current;
        const next = await build(signals, saved, current?.model);
        store = Promise.resolve(next);
        await onServed?.(next.api);
        return next;
    };

    // One change to the store at a time, in the order asked.
    let turn: Promise<unknown> = Promise.resolve();
    const serially = <T>(task: () => Promise<T>): Promise<T> => {
        const next = turn.then(task, task);
        turn = next.catch(() => undefined);
        return next;
    };

    const current = (): Promise<HostedStore> => {
        if (store) return store;
        const first = serially(async () => {
            const { signals, saved } = await inputs();
            const built = await build(signals, saved, undefined);
            await onServed?.(built.api);
            return built;
        });
        store = first;
        // The next request tries again rather than remembering the failure,
        // unless something already put another store in its place.
        first.catch(() => {
            if (store === first) store = undefined;
        });
        return first;
    };

    return {
        current,
        served,
        refresh: async () => {
            // A store still being built was built from the clicks as they were a
            // moment ago, which is as fresh as a visit needs.
            if (store === undefined) return false;
            const now = await served();
            if (fingerprint(await clicks()) === now?.from.clicks) return false;
            // The old store keeps answering until the new one is ready, and stays
            // if the new one cannot be built.
            await serially(buildAgain);
            return true;
        },
        receiveRules: async (request) => {
            if (!rules)
                return { status: 404, message: 'this store keeps no rules', changed: false };
            const now = await current();
            const { rules: shipped } = await sourceNow();
            const receipt = await receiveRules(request, rules, {
                shipped,
                // The engine's own check, the same one a preview runs, so a set
                // that previews is a set that saves.
                check: (draft) => {
                    now.model.engine.reconfigure({ rules: draft });
                },
            });
            if (receipt.status !== 204) return receipt;
            const after = receipt.changed ? await serially(buildAgain) : now;
            return { ...receipt, version: after.api.version };
        },
        change: (task) => serially(() => task(buildAgain)),
        forget: () => {
            read = undefined;
            store = undefined;
        },
        startup: () => timing,
    };
};
