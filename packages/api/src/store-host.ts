import type { Rule } from '@jasonsdevspace/shelflens';
import type { Catalog } from '@shelflens/catalog';

import { withResponseCache } from './cache.js';
import type { Store } from './context.js';
import type { EventStore } from './events.js';
import { createStoreApi, type StoreApi } from './execute.js';
import { fingerprint } from './fingerprint.js';
import { receiveRules, type RulesReceipt, type RulesRequest, type RuleStore } from './rules.js';
import { signalsOf } from './signals.js';
import { createStore } from './store.js';

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
interface StoreSource {
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

/** A store as served: the API that answers and the model behind it. */
export interface HostedStore {
    readonly api: StoreApi;
    readonly model: Store;
}

/** What a store was made from, in the form two stores are compared by. */
interface MadeFrom {
    readonly clicks: string;
    readonly rules: string;
    readonly edited: boolean;
    readonly catalog: string;
}

const sameFrom = (a: MadeFrom, b: MadeFrom): boolean =>
    a.clicks === b.clicks &&
    a.rules === b.rules &&
    a.edited === b.edited &&
    a.catalog === b.catalog;

/** How long the first build took, for the cold visit measurement. */
export interface Startup {
    /** Reading the catalog and the rules, in milliseconds. */
    readonly downloadMs: number;
    /** Building the index and the completions from them, in milliseconds. */
    readonly buildMs: number;
}

/** What a request on the rules path is answered with, and the store version after a change. */
type RulesAnswer = RulesReceipt & { readonly version?: string };

export interface StoreHost {
    /**
     * The events the host was given, which it folds into ranking and the
     * recommendations read, so a server receives into the same store.
     * Nothing for a host that keeps none.
     */
    readonly events: EventStore | undefined;
    /** Whether the host keeps saved rules, so a host without them answers the rules path at once. */
    readonly keepsRules: boolean;
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
    /**
     * Forgets the source, so the next build reads it again. The store being
     * served keeps answering until one built from the new source replaces it.
     */
    forgetSource(): void;
    /** Forgets the source and the store, for a source that is gone. */
    clear(): void;
    /** How long the first build took. */
    startup(): Startup;
}

export const createStoreHost = ({
    source,
    events,
    rules,
    onServed,
}: StoreHostOptions): StoreHost => {
    /** The store being served or being built first, for a request to wait on. */
    let store: Promise<HostedStore> | undefined;
    /**
     * The last store built and what it was made from, held apart from `store`
     * so a change in its turn compares with it and builds over it without
     * awaiting a build queued behind that same turn.
     */
    let last: { readonly hosted: HostedStore; readonly from: MadeFrom } | undefined;
    let read: Promise<StoreSource> | undefined;
    let timing: Startup = { downloadMs: 0, buildMs: 0 };

    const sourceNow = () => {
        read ??= source().catch((error: unknown) => {
            read = undefined;
            throw error;
        });
        return read;
    };

    /** What a build is made from, read together so the clicks and the rules are from one moment. */
    const inputs = async () => {
        const [kept, saved, { catalog, rules: shipped }] = await Promise.all([
            events?.all() ?? [],
            rules?.current(),
            sourceNow(),
        ]);
        return { signals: signalsOf(kept), saved, catalog, shipped };
    };

    type Inputs = Awaited<ReturnType<typeof inputs>>;

    /**
     * What a store is made from. The rules in effect are compared as their
     * text, so two sets that differ are never taken for the same, as two whose
     * short fingerprints collided would be, and a save is never lost to that.
     */
    const fromOf = ({ signals, saved, catalog, shipped }: Inputs): MadeFrom => ({
        clicks: fingerprint(signals),
        rules: JSON.stringify(saved ?? shipped),
        edited: saved !== undefined,
        catalog: catalog.version,
    });

    const served = async (): Promise<HostedStore | undefined> =>
        store ? store.catch(() => undefined) : undefined;

    /**
     * Tells the host a store is the one served. A host that fails to tidy up
     * after it, as when the worker cannot reach its cache, has a store that
     * still answers, so the failure does not fail the build.
     */
    const announce = async (next: HostedStore) => {
        await onServed?.(next.api).catch(() => undefined);
    };

    /** A store from these inputs, over the last index when the catalog is the same. */
    const build = ({ signals, saved, catalog, shipped }: Inputs): HostedStore => {
        const model = createStore({
            catalog,
            rules: saved ?? shipped,
            rulesEdited: saved !== undefined,
            signals,
            basis: last?.hosted.model,
        });
        return { api: withResponseCache(createStoreApi(model, { events })), model };
    };

    /**
     * The first store, from these inputs, or from the shipped rules when a saved set cannot be
     * built with them. A saved set outlives the engine and the catalog it was checked against, so
     * one this store refuses is set aside rather than failing every request, and kept, so it
     * applies again once a store can be built with it. A build that fails on the shipped rules
     * too fails for another reason. Later builds run in a change that checks the rules itself.
     */
    const buildFrom = (now: Inputs): { hosted: HostedStore; used: Inputs } => {
        try {
            return { hosted: build(now), used: now };
        } catch (error) {
            if (now.saved === undefined) throw error;
            const shippedOnly: Inputs = { ...now, saved: undefined };
            const hosted = (() => {
                try {
                    return build(shippedOnly);
                } catch {
                    throw error;
                }
            })();
            return { hosted, used: shippedOnly };
        }
    };

    /** Makes a store the one served, remembered with what it was made from, and tells `onServed`. */
    const serve = async (hosted: HostedStore, from: MadeFrom): Promise<HostedStore> => {
        last = { hosted, from };
        store = Promise.resolve(hosted);
        await announce(hosted);
        return hosted;
    };

    /**
     * Builds again, unless the store being served was made from the same
     * clicks, rules and catalog, and says whether it did. Run only in a turn.
     */
    const buildAgain = async (): Promise<{ store: HostedStore; built: boolean }> => {
        const now = await inputs();
        const from = fromOf(now);
        if (last && sameFrom(last.from, from)) return { store: last.hosted, built: false };
        return { store: await serve(build(now), from), built: true };
    };

    // One change to the store at a time, in the order asked.
    let turn: Promise<unknown> = Promise.resolve();
    const serially = <T>(task: () => Promise<T>): Promise<T> => {
        const next = turn.then(task, task);
        turn = next.catch(() => undefined);
        return next;
    };

    /** The last store built, or the first one built now. Run only in a turn. */
    const ensure = async (): Promise<HostedStore> => {
        if (last) return last.hosted;
        const began = performance.now();
        const now = await inputs();
        const downloaded = performance.now();
        const { hosted, used } = buildFrom(now);
        timing = { downloadMs: downloaded - began, buildMs: performance.now() - downloaded };
        return serve(hosted, fromOf(used));
    };

    const current = (): Promise<HostedStore> => {
        if (store) return store;
        const first = serially(ensure);
        store = first;
        // The next request tries again rather than remembering the failure,
        // unless something already put another store in its place.
        first.catch(() => {
            if (store === first) store = undefined;
        });
        return first;
    };

    return {
        events,
        keepsRules: rules !== undefined,
        current,
        served,
        refresh: async () => {
            // A store still being built was built from the clicks as they were a
            // moment ago, which is as fresh as a visit needs.
            if (store === undefined) return false;
            // The old store keeps answering until the new one is ready, and stays
            // if the new one cannot be built.
            return serially(buildAgain).then(
                ({ built }) => built,
                () => false
            );
        },
        receiveRules: async (request) => {
            if (!rules)
                return { status: 404, message: 'this store keeps no rules', changed: false };
            // In its turn from the moment it is asked, so a save cannot land after a
            // change asked later, such as a new catalog that resets the rules.
            return serially(async (): Promise<RulesAnswer> => {
                const now = await ensure();
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
                const after = receipt.changed ? (await buildAgain()).store : now;
                return { ...receipt, version: after.api.version };
            });
        },
        change: (task) => serially(() => task(async () => (await buildAgain()).store)),
        forgetSource: () => {
            read = undefined;
        },
        clear: () => {
            read = undefined;
            store = undefined;
            last = undefined;
        },
        startup: () => timing,
    };
};
