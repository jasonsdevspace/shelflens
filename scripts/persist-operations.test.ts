import { describe, expect, it } from 'vitest';

import { nameOperations } from '../packages/api/scripts/persist-operations.mjs';

/** Two documents as codegen writes them, an operation and the fragment it uses. */
const generated = `export const CardFragmentDoc = new TypedDocumentString(\`
    fragment Card on Product { sku }
    \`, {"fragmentName":"Card"}) as unknown as TypedDocumentString<CardFragment, unknown>;
export const ProductDocument = new TypedDocumentString(\`
    query Product($sku: ID!) { product(sku: $sku) { ...Card } }
    fragment Card on Product { sku }
    \`) as unknown as TypedDocumentString<ProductQuery, ProductQueryVariables>;
`;

describe('naming the operations', () => {
    it('keeps each name and drops the text, which only the manifest holds', () => {
        const { named, manifest } = nameOperations(generated);
        const [[hash, text] = []] = [...manifest];
        expect(text).toBe(
            'query Product($sku:ID!){product(sku:$sku){...Card}}fragment Card on Product{sku}'
        );
        expect(named).toContain(
            `ProductDocument = new TypedDocumentString('', { hash: '${hash}' })`
        );
        expect(named).toContain(
            `CardFragmentDoc = new TypedDocumentString('', {"fragmentName":"Card"})`
        );
        expect(named).not.toContain('query Product');
    });

    it('refuses operations already named, rather than naming nothing', () => {
        const { named } = nameOperations(generated);
        expect(() => nameOperations(named)).toThrow('run `npm run codegen`');
    });
});
