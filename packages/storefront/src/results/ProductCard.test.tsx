import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { CardFragment } from '../generated/operations.js';
import { type Hit, ProductCard } from './ProductCard.jsx';

const product: CardFragment = {
    sku: 'SL-00001',
    name: 'Ridgeback Relaxed Puffer Jacket',
    brand: { name: 'Ridgeback' },
    colors: ['Charcoal'],
    price: { min: { amount: 34500, currency: 'USD' }, max: { amount: 36000, currency: 'USD' } },
    rating: { average: 5, count: 544 },
    inStock: true,
};

const hitWith = (explanation: Hit['explanation']): Hit =>
    ({ product, score: 25.34, explanation }) as Hit;

const card = (hit: Hit) =>
    render(
        <ul>
            <ProductCard
                product={product}
                href="/?product=SL-00001"
                onOpen={() => undefined}
                explain={{ rank: 1, hit, phrase: true }}
            />
        </ul>
    );

describe('the explanation on a card', () => {
    it('answers where it landed, what a rule did, then what it matched, in that order', () => {
        card(
            hitWith({
                matches: [{ typed: 'jacket', matched: 'jacket', field: 'name', route: 'EXACT' }],
                rules: [{ ruleId: 'featured-jackets', action: 'PIN', weight: null }],
            })
        );
        const lines = screen
            .getAllByRole('listitem')
            .filter((item) => item.closest('.card-explain'))
            .map((item) => item.textContent);
        expect(lines).toEqual([
            'Result 1, score 25.34',
            'Pinned to the top by rule featured-jackets',
            '"jacket" matched "jacket" in the name',
        ]);
    });

    it('waits for the answer that carries it, rather than showing a bare rank', () => {
        card(hitWith(undefined));
        expect(screen.queryByRole('list', { name: /Why this is result/ })).toBeNull();
        expect(screen.queryByText(/Result 1/)).toBeNull();
    });
});
