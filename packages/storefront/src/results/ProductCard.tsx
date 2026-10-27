import { formatPriceRange } from '../format/money.js';
import type { SearchQuery } from '../generated/operations.js';
import { Swatch } from '../search/Swatch.jsx';

export type Hit = SearchQuery['search']['items'][number];

export interface ProductCardProps {
    readonly product: Hit['product'];
    /** Where the card leads, so it is a real link that opens in a new tab too. */
    readonly href: string;
    readonly onOpen: () => void;
}

export const ProductCard = ({ product, href, onOpen }: ProductCardProps) => (
    <li className="card">
        <a
            className="card-link"
            href={href}
            onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                event.preventDefault();
                onOpen();
            }}
        >
            <Swatch color={product.colors[0]} brand={product.brand.name} size={64} />
            <span className="card-text">
                <span className="card-name">{product.name}</span>
                <span className="card-meta">{product.brand.name}</span>
                <span className="card-price">
                    {formatPriceRange(product.price.min, product.price.max)}
                </span>
                {product.rating && (
                    <span className="card-rating">
                        {product.rating.average.toFixed(1)} from {product.rating.count} ratings
                    </span>
                )}
                {!product.inStock && <span className="card-stock">Out of stock</span>}
            </span>
        </a>
    </li>
);
