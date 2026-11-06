import { describe, expect, it } from 'vitest';

import { formOf, fresh, problemsOf, summary } from './rule-form.js';

describe('a rule in a few words', () => {
    it('says a boost and a bury by their factor, as the cards do', () => {
        expect(
            summary(
                {
                    id: 'summer-promo',
                    boost: [{ attribute: { name: 'brand', value: 'Ridgeback' }, weight: 1.5 }],
                    bury: [{ ids: ['SL-1', 'SL-2'], weight: 0.5 }],
                },
                'en-US'
            )
        ).toBe('Boosts Ridgeback 1.5×. Buries 2 products 0.5×');
    });
});

describe('what is wrong with a rule', () => {
    const pin = (skus: string[]) => ({ ...fresh('jacket'), action: 'pin' as const, skus });

    it('says which product field a product the results have not shown is in', () => {
        const problems = problemsOf(pin(['SL-2', ' SL-9 ']), new Set(['SL-2']));
        expect(problems.skus).toMatch(/SKU SL-9\./);
        expect(problems.skuAt).toBe(1);
    });

    it('puts a rule that names no product on its first product field', () => {
        const problems = problemsOf(pin(['', '']), new Set(['SL-2']));
        expect(problems.skus).toBe('Name at least one product.');
        expect(problems.skuAt).toBe(0);
    });

    it('gives a saved rule that names no product a field to say so on', () => {
        const form = formOf({ id: 'empty', when: { queries: ['jacket'] }, pin: [] });
        expect(form.skus).toEqual(['']);
        expect(problemsOf(form, new Set()).skuAt).toBe(0);
    });

    it('says nothing of a product field when the products are sound', () => {
        expect(problemsOf(pin(['SL-2']), new Set(['SL-2']))).toEqual({});
    });
});

describe('a new rule’s id', () => {
    it('folds the accents of the phrase it starts from, as the catalog’s ids do', () => {
        expect(fresh('café crème').id).toMatch(/^cafe-creme-[a-z0-9]{1,4}$/);
        expect(fresh('').id).toMatch(/^rule-/);
    });
});
