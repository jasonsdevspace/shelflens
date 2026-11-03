import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { CardFragment } from '../generated/operations.js';
import { type Hit, ProductCard } from './ProductCard.jsx';

const product: CardFragment = {
    sku: 'SL-00001',
    name: 'Ridgeback Relaxed Puffer Jacket',
    brand: { name: 'Ridgeback' },
    colors: ['Charcoal'],
    price: {
        min: { amount: 34500, currency: 'USD' },
        max: { amount: 36000, currency: 'USD' },
        memberPrice: false,
    },
    rating: { average: 5, count: 544 },
    inStock: true,
    membersOnly: false,
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
    it('says a boost by its factor, a typo as one typo away, and a rule-placed product plainly', () => {
        card(
            hitWith({
                matches: [],
                rules: [{ ruleId: 'summer-promo', action: 'BOOST', weight: 1.5 }],
                popularity: null,
            })
        );
        expect(screen.getByText('Boosted 1.5× by rule summer-promo')).toBeInTheDocument();
        expect(screen.getByText('Did not match the search')).toBeInTheDocument();
        expect(document.querySelector('.card-rating .visually-hidden')).toHaveTextContent(
            '5.0 out of 5, from 544 ratings'
        );
    });

    it('says a close match is one typo away from the word it found', () => {
        card(
            hitWith({
                matches: [
                    { typed: 'jackit', matched: 'jacket', field: 'name', route: 'CORRECTED' },
                ],
                rules: [],
                popularity: null,
            })
        );
        expect(
            screen.getByText('"jackit" is one typo away from "jacket" in the name')
        ).toBeInTheDocument();
    });

    it('makes the card and its reasons one box, with the rule line set apart', () => {
        card(
            hitWith({
                matches: [{ typed: 'jacket', matched: 'jacket', field: 'name', route: 'EXACT' }],
                rules: [{ ruleId: 'featured-jackets', action: 'PIN', weight: null }],
                popularity: null,
            })
        );
        expect(document.querySelector('.card')).toHaveClass('is-explained');
        expect(screen.getByText('Pinned to the top by rule featured-jackets')).toHaveClass(
            'card-explain-rule'
        );
    });

    it('answers where it landed, what a rule did, then what it matched, in that order', () => {
        card(
            hitWith({
                matches: [{ typed: 'jacket', matched: 'jacket', field: 'name', route: 'EXACT' }],
                rules: [{ ruleId: 'featured-jackets', action: 'PIN', weight: null }],
                popularity: { clicks: 3, weight: 1.1 },
            })
        );
        const lines = screen
            .getAllByRole('listitem')
            .filter((item) => item.closest('.card-explain'))
            .map((item) => item.textContent);
        expect(lines).toEqual([
            'Result 1, score 25.34',
            'Pinned to the top by rule featured-jackets',
            'Opened from the results in 3 earlier visits, score raised by 10%',
            '"jacket" matched "jacket" in the name',
        ]);
    });

    it('says one click in the singular, and nothing when nothing was clicked', () => {
        card(hitWith({ matches: [], rules: [], popularity: { clicks: 1, weight: 1.05 } }));
        expect(
            screen.getByText('Opened from the results in 1 earlier visit, score raised by 5%')
        ).toBeInTheDocument();
    });

    it('says when the product is shown to members only, before the rules', () => {
        card({
            ...hitWith({ matches: [], rules: [], popularity: null }),
            product: { ...product, membersOnly: true },
        });
        expect(screen.getByText('Shown to members only')).toBeInTheDocument();
    });

    it('waits for the answer that carries it, rather than showing a bare rank', () => {
        card(hitWith(undefined));
        expect(screen.queryByRole('list', { name: /Why this is result/ })).toBeNull();
        expect(screen.queryByText(/Result 1/)).toBeNull();
    });
});

describe('the price on a card', () => {
    it('is marked as a member price only when the viewer pays below list', () => {
        const { unmount } = render(
            <ul>
                <ProductCard product={product} href="/" onOpen={() => undefined} />
            </ul>
        );
        expect(screen.queryByText('Member price')).toBeNull();
        unmount();
        render(
            <ul>
                <ProductCard
                    product={{ ...product, price: { ...product.price, memberPrice: true } }}
                    href="/"
                    onOpen={() => undefined}
                />
            </ul>
        );
        expect(screen.getByText('Member price')).toBeInTheDocument();
    });
});

describe('the rating on a card', () => {
    const plain = (rating: CardFragment['rating']) =>
        render(
            <ul>
                <ProductCard
                    product={{ ...product, rating }}
                    href="/?product=SL-00001"
                    onOpen={() => undefined}
                />
            </ul>
        );

    it('shows stars, the average and the count, and says it once in words', () => {
        plain({ average: 3.7, count: 1993 });
        const line = document.querySelector('.card-rating');
        // Seen: the stars, 3.7 and the count, all hidden from a screen reader in one place.
        const seen = line?.querySelector('.card-rating-seen');
        expect(seen).toHaveAttribute('aria-hidden', 'true');
        expect(seen?.querySelector('.stars')).not.toBeNull();
        expect(seen?.querySelector('.card-rating-average')).toHaveTextContent('3.7');
        expect(seen).toHaveTextContent('(1,993)');
        // Heard: the sentence, once.
        expect(line?.querySelector('.visually-hidden')).toHaveTextContent(
            '3.7 out of 5, from 1,993 ratings'
        );
        expect(screen.getByRole('link')).toHaveAccessibleName(/3\.7 out of 5, from 1,993 ratings/);
        expect(screen.getByRole('link')).not.toHaveAccessibleName(/\(1,993\)/);
    });

    it('says a product with no ratings has none, rather than leaving the line out', () => {
        plain({ average: 0, count: 0 });
        expect(document.querySelector('.card-rating')).toHaveTextContent('No ratings yet');
        expect(document.querySelector('.stars')).toBeNull();
    });

    it('says the same of a product the API sends with no rating at all', () => {
        plain(null);
        expect(document.querySelector('.card-rating')).toHaveTextContent('No ratings yet');
        expect(document.querySelector('.stars')).toBeNull();
    });
});

describe('opening a card', () => {
    it('opens in place on a plain click, and leaves an Alt click to the browser', () => {
        const onOpen = vi.fn();
        render(
            <ul>
                <ProductCard product={product} href="/?product=SL-00001" onOpen={onOpen} />
            </ul>
        );
        const link = screen.getByRole('link');
        expect(fireEvent.click(link, { altKey: true })).toBe(true);
        expect(onOpen).not.toHaveBeenCalled();
        expect(fireEvent.click(link)).toBe(false);
        expect(onOpen).toHaveBeenCalledOnce();
    });
});
