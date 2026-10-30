import { type SearchState, serializeSearchState } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import type { RecommendationsQuery } from '../generated/operations.js';
import { ProductCard } from '../results/ProductCard.jsx';

/**
 * What stands beside a product, under a heading that says which it is:
 * what this tab viewed with it, or the most rated in its category when
 * nothing has been viewed with it yet. Nothing at all when the category
 * has nothing else to show, rather than a heading over an empty list.
 */

export type RailData = NonNullable<RecommendationsQuery['recommendations']>;

export interface RailProps {
    readonly rail: RailData;
    readonly state: SearchState;
    readonly navigate: Navigate;
}

export const RAIL_HEADING_ID = 'rail-heading';

export const railHeading = (rail: RailData): string =>
    rail.source === 'VIEWED_TOGETHER'
        ? 'Viewed with this product'
        : `Top rated in ${rail.category.name}`;

export const Rail = ({ rail, state, navigate }: RailProps) => {
    if (rail.items.length === 0) return null;
    const heading = railHeading(rail);
    return (
        <section className="rail" aria-labelledby={RAIL_HEADING_ID}>
            <h2 id={RAIL_HEADING_ID} className="product-subheading">
                {heading}
            </h2>
            <ul className="cards" aria-label={heading}>
                {rail.items.map((product) => (
                    <ProductCard
                        key={product.sku}
                        product={product}
                        href={serializeSearchState({ ...state, product: product.sku })}
                        onOpen={() => navigate({ ...state, product: product.sku })}
                    />
                ))}
            </ul>
        </section>
    );
};
