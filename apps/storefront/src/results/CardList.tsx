import { type SearchState, serializeSearchState } from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import type { CardFragment } from '../generated/operations.js';
import { ProductCard, type ProductCardProps } from './ProductCard.jsx';

/**
 * Products as cards, each a link to its own page over the state the list
 * is shown in, so closing the product comes back to the same list.
 */
export const CardList = ({
    products,
    state,
    navigate,
    label,
    onOpened,
    explainOf,
}: {
    readonly products: readonly CardFragment[];
    readonly state: SearchState;
    readonly navigate: Navigate;
    /** What the list is, left out where a heading names its section already. */
    readonly label?: string;
    /** Told which card was opened and at what place, before the page moves to it. */
    readonly onOpened?: (sku: string, index: number) => void;
    /** Why the product at this place ranked there, in explain mode. */
    readonly explainOf?: (index: number) => ProductCardProps['explain'];
}) => (
    <ul className="cards" aria-label={label}>
        {products.map((product, index) => (
            <ProductCard
                key={product.sku}
                product={product}
                href={serializeSearchState({ ...state, product: product.sku })}
                onOpen={() => {
                    onOpened?.(product.sku, index);
                    navigate({ ...state, product: product.sku });
                }}
                explain={explainOf?.(index)}
            />
        ))}
    </ul>
);
