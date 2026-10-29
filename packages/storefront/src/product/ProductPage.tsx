import { useEffect, useRef } from 'react';

import { useStoreInfo } from '../app/StoreContext.jsx';
import type { SearchState } from '../app/url.js';
import { useQuery } from '../app/useQuery.js';
import type { Navigate } from '../app/useUrlState.js';
import type { GraphQLClient } from '../client/graphql.js';
import { formatMoney, formatPriceRange } from '../format/money.js';
import { ProductDocument } from '../generated/operations.js';
import { Swatch } from '../search/Swatch.jsx';

/**
 * One product, over the results it was found in.
 *
 * The results state stays in the URL beneath the product, so closing it
 * returns to the same page, filters and all.
 */

export interface ProductPageProps {
    readonly client: GraphQLClient;
    readonly sku: string;
    readonly state: SearchState;
    readonly navigate: Navigate;
}

export const ProductPage = ({ client, sku, state, navigate }: ProductPageProps) => {
    const { data, loading, error } = useQuery(client, ProductDocument, { sku });
    const { locale } = useStoreInfo();
    // A new view: focus lands on its heading, so a keyboard or screen reader user
    // starts where the page starts rather than on the body.
    const heading = useRef<HTMLHeadingElement>(null);
    const shown = data?.product?.sku;
    useEffect(() => {
        if (shown !== undefined) heading.current?.focus();
    }, [shown]);
    const back = () => {
        const { product: _dropped, ...rest } = state;
        navigate(rest);
    };

    if (error) {
        return (
            <p className="notice" role="alert">
                {error}
            </p>
        );
    }
    if (loading || !data) return <p className="notice">Loading product.</p>;
    const { product } = data;
    if (!product) {
        return (
            <section className="product">
                <p className="notice" role="alert">
                    There is no product {sku} in this store.
                </p>
                <button type="button" className="back" onClick={back}>
                    Back to results
                </button>
            </section>
        );
    }
    return (
        <article className="product" aria-labelledby="product-heading">
            <button type="button" className="back" onClick={back}>
                Back to results
            </button>
            <div className="product-head">
                <Swatch color={product.colors[0]} brand={product.brand.name} size={96} />
                <div>
                    <p className="product-crumbs">
                        {product.categoryPath.map((category) => category.name).join(' / ')}
                    </p>
                    <h1 id="product-heading" className="product-name" ref={heading} tabIndex={-1}>
                        {product.name}
                    </h1>
                    <p className="product-meta">
                        {product.brand.name}
                        {' · '}
                        {product.material}
                        {product.rating &&
                            ` · ${product.rating.average.toFixed(1)} from ${product.rating.count} ratings`}
                    </p>
                    <p className="product-price">
                        {formatPriceRange(product.price.min, product.price.max, locale)}
                    </p>
                    {!product.inStock && <p className="card-stock">Out of stock</p>}
                </div>
            </div>
            <p className="product-description">{product.description}</p>
            <h2 className="product-subheading">Variants</h2>
            <table className="variants">
                <thead>
                    <tr>
                        <th scope="col">Color</th>
                        <th scope="col">Size</th>
                        <th scope="col">Price</th>
                        <th scope="col">Stock</th>
                    </tr>
                </thead>
                <tbody>
                    {product.variants.map((variant) => (
                        <tr key={variant.sku}>
                            <td>{variant.color}</td>
                            <td>{variant.size}</td>
                            <td>{formatMoney(variant.price, locale)}</td>
                            <td>{variant.inStock ? 'In stock' : 'Out of stock'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </article>
    );
};
