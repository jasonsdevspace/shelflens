import { assertValidSchema, getNamedType, isInputObjectType, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';

import { buildStoreSchema } from './schema.js';

const schema = buildStoreSchema();

describe('the schema', () => {
    it('builds and is valid', () => {
        expect(() => assertValidSchema(schema)).not.toThrow();
    });

    it('takes exactly one matcher per filter', () => {
        const match = getNamedType(schema.getType('MatchInput'));
        expect(isInputObjectType(match) && match.isOneOf).toBe(true);
    });

    it('names the same attributes for filters and facets', () => {
        const attribute = schema.getType('FilterAttribute');
        const facet = schema.getType('Facet');
        expect(attribute).toBeDefined();
        expect(facet?.toString()).toBe('Facet');
    });

    it('accepts the query a results page sends', () => {
        const document = parse(`
            query Results($input: SearchInput!) {
                search(input: $input) {
                    total
                    matching
                    items { product { sku name price { min { amount currency } } } score
                            explanation { matches { typed matched route } rules { ruleId action } } }
                    facets {
                        name
                        attribute
                        ... on ValueFacet { buckets { value count } }
                        ... on RangeFacet { buckets { from to count } }
                        ... on StatsFacet { min max count }
                    }
                    merchandising { applied setAsideBySort }
                }
                store { catalogVersion viewer { group } }
            }
        `);
        expect(validate(schema, document)).toEqual([]);
    });

    it('refuses a query for a price that is not the viewer own', () => {
        const document = parse(
            `{ search(input: { phrase: "x" }) { items { product { memberPrice { min { amount } } } } } }`
        );
        expect(validate(schema, document).map((e) => e.message)).toEqual([
            expect.stringMatching(/Cannot query field "memberPrice"/),
        ]);
    });
});
