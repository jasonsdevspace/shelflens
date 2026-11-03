import { readFileSync } from 'node:fs';

import {
    createMemoryEventStore,
    createMemoryRuleStore,
    createStoreHost,
    parseRulesFile,
    type StoreHost,
} from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

/** The merchandising rules, as a rules file holds them. */
type Rules = ReturnType<typeof parseRulesFile>;

/**
 * The store host a local run serves, the Node server's and the dev
 * server's alike: the one the service worker runs, with the events and the
 * saved rules kept in memory for as long as the process runs, so the
 * server receives events into the same store the clicks are read from.
 */
export const createLocalHost = ({
    catalog,
    rules,
}: {
    readonly catalog: Catalog;
    readonly rules: Rules;
}): StoreHost =>
    createStoreHost({
        source: () => Promise.resolve({ catalog, rules }),
        events: createMemoryEventStore(),
        rules: createMemoryRuleStore(),
    });

/** The rules in a JSON file of the shape the demo ships, checked as every host checks them. */
export const readRulesFile = (path: string | URL): Rules =>
    parseRulesFile(JSON.parse(readFileSync(path, 'utf8')));
