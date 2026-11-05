import {
    getNamedType,
    isEnumType,
    isInputObjectType,
    isInterfaceType,
    isObjectType,
    parse,
    validate,
} from 'graphql';
import { describe, expect, it } from 'vitest';

import { buildStoreSchema } from './schema.js';

const schema = buildStoreSchema();

describe('the schema', () => {
    it('names the same attributes for filters and facets', () => {
        const attributes = (type: string) => {
            const named = schema.getType(type);
            const field =
                isInputObjectType(named) || isInterfaceType(named) || isObjectType(named)
                    ? named.getFields()['attribute']
                    : undefined;
            const values = field && getNamedType(field.type);
            return isEnumType(values) ? values.getValues().map((value) => value.name) : [];
        };
        const filters = attributes('FilterInput');
        expect(filters).toContain('BRAND');
        for (const facet of ['Facet', 'ValueFacet', 'RangeFacet', 'StatsFacet']) {
            expect(attributes(facet)).toEqual(filters);
        }
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
