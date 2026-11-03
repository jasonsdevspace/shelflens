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
 * The store a local run serves, the Node server's and the dev server's
 * alike: the same host the service worker runs, with the clicks folded in
 * when a visit begins and the rules a merchandiser saves, both kept in
 * memory for as long as the process runs. The host keeps the events, so a
 * server reads them from it rather than being handed them again.
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

/** The merchandising rules in a JSON file of the shape the demo ships, checked as every host does. */
export const readRulesFile = (path: string | URL): Rules =>
    parseRulesFile(JSON.parse(readFileSync(path, 'utf8')));
