// @vitest-environment node
import { readFileSync } from 'node:fs';

import { createStore, createStoreApi, parseRulesFile, viewerFromHeader } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

/*
 * The rules file the demo ships, against the catalog the demo ships.
 *
 * A rule that names a product or an attribute the catalog does not have
 * fails here, before a shopper sees it. And the rules do what they say:
 * the featured jackets come first for "jacket", the sample is hidden, and
 * the window that has not opened yet waits.
 */

const file = new URL('../../public/rules.json', import.meta.url);
const rules = parseRulesFile(JSON.parse(readFileSync(file, 'utf8')));

describe('the shipped rules', () => {
    const catalog = generateCatalog();
    const api = createStoreApi(createStore({ catalog, rules }));
    const skus = async (phrase: string, now: Date) => {
        const response = await api.run(
            {
                query: `{ search(input: { phrase: "${phrase}", pageSize: 50 }) { items { product { sku } } merchandising { applied } } }`,
            },
            viewerFromHeader(undefined),
            now
        );
        if (response.errors) throw new Error(JSON.stringify(response.errors));
        const { search } = response.data as {
            search: { items: { product: { sku: string } }[]; merchandising: { applied: string[] } };
        };
        return {
            skus: search.items.map((hit) => hit.product.sku),
            applied: search.merchandising.applied,
        };
    };

    it('validate against the shipped catalog', () => {
        expect(rules.length).toBeGreaterThan(0);
        expect(() => createStore({ catalog, rules })).not.toThrow();
    });

    it('put the featured jackets first and hide the sample', async () => {
        const featured = rules.find((rule) => rule.id === 'featured-jackets');
        const sample = rules.find((rule) => rule.id === 'racer-sample');
        if (!featured?.pin || !sample?.hide) throw new Error('expected the jacket rules');
        const { skus: found, applied } = await skus('jacket', new Date('2026-10-28T12:00:00Z'));
        expect(found.slice(0, featured.pin.length)).toEqual(featured.pin);
        expect(found).not.toContain(sample.hide[0]);
        expect(applied).toEqual(expect.arrayContaining(['featured-jackets', 'racer-sample']));
    });

    it('wait for a window that has not opened', async () => {
        const spring = rules.find((rule) => rule.id === 'spring-sandals');
        if (!spring?.pin) throw new Error('expected the sandal rule');
        const before = await skus('sandal', new Date('2026-10-28T12:00:00Z'));
        expect(before.applied).not.toContain('spring-sandals');
        const during = await skus('sandal', new Date('2027-04-01T12:00:00Z'));
        expect(during.applied).toContain('spring-sandals');
        expect(during.skus[0]).toBe(spring.pin[0]);
    });
});
