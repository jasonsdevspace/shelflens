import { describe, expect, it } from 'vitest';

import { type RailData, railHeading } from './Rail.jsx';

const rail = (source: RailData['source'], viewedTogether: number, items: number): RailData =>
    ({
        source,
        viewedTogether,
        category: { id: 'jackets', name: 'Jackets' },
        items: Array.from({ length: items }, (_, i) => ({ sku: `SL-${String(i)}` })),
    }) as unknown as RailData;

describe('the heading over the rail', () => {
    it('says where the products come from: the category, the views, or both in order', () => {
        expect(railHeading(rail('CATEGORY_BESTSELLERS', 0, 6))).toBe('Most rated in Jackets');
        expect(railHeading(rail('VIEWED_TOGETHER', 6, 6))).toBe('Viewed with this product');
        expect(railHeading(rail('VIEWED_TOGETHER', 1, 6))).toBe(
            'Viewed with this product, then most rated in Jackets'
        );
    });

    it('takes whether anything was viewed from the source, so the two never disagree', () => {
        // An answer with no count still says it was viewed with this product, as its source does.
        expect(railHeading(rail('VIEWED_TOGETHER', 0, 6))).toBe('Viewed with this product');
        expect(railHeading(rail('CATEGORY_BESTSELLERS', 3, 6))).toBe('Most rated in Jackets');
    });
});
