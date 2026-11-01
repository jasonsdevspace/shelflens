import { useEffect, useRef } from 'react';

import { LoadFailure } from '../app/LoadFailure.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import type { SearchState } from '../app/url.js';
import { useQuery } from '../app/useQuery.js';
import type { Navigate } from '../app/useUrlState.js';
import type { GraphQLClient } from '../client/graphql.js';
import { useRecord } from '../events/EventsContext.jsx';
import { sessionId } from '../events/session.js';
import { formatMoney, formatPriceRange } from '../format/money.js';
import { ProductDocument, RecommendationsDocument } from '../generated/operations.js';
import { Swatch } from '../search/Swatch.jsx';
import { Rail } from './Rail.jsx';

/**
 * One product, over the results it was found in.
 *
 * The results state stays in the URL beneath the product, so closing it
 * returns to the same page, filters and all. What stands beside the
 * product is asked for on its own, once the product has answered, so the
 * product's answer stays one every cache may keep while the rail's, which
 * reads the events collected so far, is asked for every time. While the
 * rail for a new product is on its way nothing is shown, since the last
 * product's rail would be the wrong one, and could hold this product.
 */

/** How many products stand beside one. */
export const RAIL_SIZE = 6;

export interface ProductPageProps {
    readonly client: GraphQLClient;
    readonly sku: string;
    readonly state: SearchState;
    readonly navigate: Navigate;
}

export const ProductPage = ({ client, sku, state, navigate }: ProductPageProps) => {
    const { data, loading, error, retry } = useQuery(client, ProductDocument, { sku });
    const { locale } = useStoreInfo();
    // A new view: focus lands on its heading, or on the notice when there is no
    // product, so a keyboard or screen reader user starts where the page starts
    // rather than on the body. Again after every load, since loading unmounts both.
    const heading = useRef<HTMLHeadingElement>(null);
    const missing = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!loading) (heading.current ?? missing.current)?.focus();
    }, [loading, data]);
    // A view, once the product has answered, so a missing product is not one.
    const record = useRecord();
    const viewed = data?.product?.sku;
    useEffect(() => {
        if (viewed !== undefined) record({ kind: 'view', sku: viewed });
    }, [record, viewed]);
    const rail = useQuery(
        client,
        RecommendationsDocument,
        viewed === undefined ? undefined : { sku: viewed, limit: RAIL_SIZE, session: sessionId() }
    );
    const back = () => {
        const { product: _dropped, ...rest } = state;
        navigate(rest);
    };

    if (error) {
        return (
            <section className="product" ref={missing} tabIndex={-1}>
                <LoadFailure what="This product" reason={error} onRetry={retry} announce={false}>
                    <button type="button" className="back" onClick={back}>
                        Back to results
                    </button>
                </LoadFailure>
            </section>
        );
    }
    if (loading || !data) return <p className="notice">Loading the product.</p>;
    const { product } = data;
    if (!product) {
        return (
            <section className="product" ref={missing} tabIndex={-1}>
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
                    {product.price.memberPrice && <p className="product-member">Member price</p>}
                    {product.membersOnly && <p className="product-member">Members only</p>}
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
            {!rail.loading && rail.data?.recommendations && (
                <Rail rail={rail.data.recommendations} state={state} navigate={navigate} />
            )}
        </article>
    );
};
