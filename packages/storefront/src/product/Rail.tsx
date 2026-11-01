import { type SearchState, serializeSearchState } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import type { RecommendationsQuery } from '../generated/operations.js';
import { ProductCard } from '../results/ProductCard.jsx';

/**
 * What stands beside a product, under a heading that says which it is:
 * what this tab viewed with it, the most rated in its category when
 * nothing has been viewed with it yet, or both, in that order, when a few
 * views lead and the category fills the rest. Nothing at all when the
 * category has nothing else to show, rather than a heading over an empty
 * list.
 */

export type RailData = NonNullable<RecommendationsQuery['recommendations']>;

export interface RailProps {
    readonly rail: RailData;
    readonly state: SearchState;
    readonly navigate: Navigate;
}

export const RAIL_HEADING_ID = 'rail-heading';

/**
 * The source says whether anything was viewed with the product, and the
 * count says how much of the rail that is, so the two never disagree on
 * the first and an answer without a count is still headed truly.
 */
export const railHeading = (rail: RailData): string => {
    const mostRated = `most rated in ${rail.category.name}`;
    if (rail.source !== 'VIEWED_TOGETHER') return `Most rated in ${rail.category.name}`;
    const viewed = rail.viewedTogether > 0 ? rail.viewedTogether : rail.items.length;
    return viewed < rail.items.length
        ? `Viewed with this product, then ${mostRated}`
        : 'Viewed with this product';
};

export const Rail = ({ rail, state, navigate }: RailProps) => {
    if (rail.items.length === 0) return null;
    const heading = railHeading(rail);
    return (
        <section className="rail" aria-labelledby={RAIL_HEADING_ID}>
            <h2 id={RAIL_HEADING_ID} className="product-subheading">
                {heading}
            </h2>
            {/* The section is named by the heading already, so the list is not named again. */}
            <ul className="cards">
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
