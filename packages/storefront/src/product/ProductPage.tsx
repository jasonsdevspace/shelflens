import { type ReactNode, type RefObject, useEffect, useId, useRef, useState } from 'react';

import { LoadFailure } from '../app/LoadFailure.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import { type SearchState, serializeSearchState } from '../app/url.js';
import { useQuery } from '../app/useQuery.js';
import type { Navigate } from '../app/useUrlState.js';
import type { CustomerGroup, GraphQLClient } from '../client/graphql.js';
import { useRecord } from '../events/EventsContext.jsx';
import { sessionId } from '../events/session.js';
import { formatMoney, formatPriceRange } from '../format/money.js';
import {
    ProductDocument,
    type ProductQuery,
    RecommendationsDocument,
    type RecommendationsQuery,
} from '../generated/operations.js';
import { focusIsFree } from '../results/useReturnFocus.js';
import { Swatch } from '../search/Swatch.jsx';
import { memberLine, metaLine } from './lines.js';
import { Rail } from './Rail.jsx';
import { variantRows } from './variants.js';

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

/** What a guest is told under a missing product, in the switch's own words. */
const FOR_MEMBERS =
    'Some products are for members only. Choose "Member" under "Shopping as" to see them.';

/** Said only where it can be true: to a guest, with a switch to name and products it would show. */
const forMembers = ({
    group,
    switchable,
    membersOnly,
}: Pick<ProductPageProps, 'group' | 'switchable' | 'membersOnly'>): string | undefined =>
    group === 'guest' && switchable === true && membersOnly !== false ? FOR_MEMBERS : undefined;

/** How many products stand beside one. */
export const RAIL_SIZE = 6;

export interface ProductPageProps {
    readonly client: GraphQLClient;
    readonly sku: string;
    readonly state: SearchState;
    readonly navigate: Navigate;
    /** Whether the visit began on this product, rather than opening it from the results. */
    readonly direct?: boolean;
    /** Who is shopping, so a missing product can say how a member would see more. */
    readonly group?: CustomerGroup;
    /** Whether the viewer switch is beside the page, so the way to it can be named. */
    readonly switchable?: boolean;
    /**
     * Whether the store has products for members only, so a missing one may
     * be one of them. Unless told otherwise, a store has.
     */
    readonly membersOnly?: boolean | undefined;
}

/**
 * The way out, named for where it goes. A visitor who arrived on the
 * product, with nothing in the address beneath it, has seen no results to
 * go back to, so the button offers the store instead.
 */
const backLabel = (state: SearchState, direct: boolean): string => {
    const { product: _shown, ...behind } = state;
    return direct && serializeSearchState(behind) === ''
        ? 'Browse all products'
        : 'Back to results';
};

/**
 * A view with no product in it: loading, missing or failed, with the way
 * out beside it. Focus lands on the view, which is named by its line, so
 * the line is heard once, as focus arrives, rather than also as an alert
 * or a status. A view that is the page's answer, not a moment on the way
 * to one, has a heading too.
 */
const Bare = ({
    view,
    title,
    line,
    note,
    children,
}: {
    readonly view: RefObject<HTMLElement | null>;
    readonly title?: string;
    /** What the view says, when it is one line. */
    readonly line?: string;
    /** A line after it, said with it as focus arrives. */
    readonly note?: string | undefined;
    readonly children: ReactNode;
}) => {
    const id = useId();
    return (
        <section
            className="product"
            ref={view}
            tabIndex={-1}
            aria-labelledby={line === undefined ? undefined : id}
            aria-describedby={note === undefined ? undefined : `${id}-note`}
        >
            {title !== undefined && <h1 className="product-name">{title}</h1>}
            {line !== undefined && (
                <p className={title === undefined ? 'notice' : 'notice is-answer'} id={id}>
                    {line}
                </p>
            )}
            {note !== undefined && (
                <p className="notice" id={`${id}-note`}>
                    {note}
                </p>
            )}
            {children}
        </section>
    );
};

/**
 * Where focus goes, and when. A new product puts it on the page at once,
 * on the loading line while the product is on its way and on its heading
 * or notice once it lands, so a keyboard or screen reader user starts
 * where the page starts rather than on the body. The same product asked
 * again, as a switch of viewer does, leaves focus where the visitor put
 * it, unless what held it has gone, as Try again goes once pressed.
 */
const useProductFocus = ({
    sku,
    loading,
    answer,
    heading,
    view,
}: {
    readonly sku: string;
    readonly loading: boolean;
    /** The answer in hand, so each one that lands is a moment to check focus. */
    readonly answer: unknown;
    readonly heading: RefObject<HTMLHeadingElement | null>;
    readonly view: RefObject<HTMLElement | null>;
}) => {
    const landed = useRef<string>(undefined);
    useEffect(() => {
        const target = heading.current ?? view.current;
        if (landed.current !== sku) {
            target?.focus();
            if (!loading) landed.current = sku;
        } else if (focusIsFree()) {
            // What held focus has gone, as Try again goes once pressed.
            target?.focus();
        }
    }, [sku, loading, answer, heading, view]);
};

/** The browser tab names the product, and gives back its own name once the product closes. */
const useTitle = (name: string | undefined) => {
    useEffect(() => {
        if (name === undefined) return;
        const before = document.title;
        document.title = before === '' ? name : `${name}, ${before}`;
        return () => {
            document.title = before;
        };
    }, [name]);
};

/**
 * The browser puts back the scroll of a page it remembers, which over a
 * product still loading is a place on a shorter page. Focus already puts
 * the heading on screen, so while a product is open the browser leaves
 * the scroll alone.
 */
const useOwnScroll = () => {
    useEffect(() => {
        const before = window.history.scrollRestoration;
        window.history.scrollRestoration = 'manual';
        return () => {
            window.history.scrollRestoration = before;
        };
    }, []);
};

type Product = NonNullable<ProductQuery['product']>;
type Recommended = NonNullable<RecommendationsQuery['recommendations']>;

/** The product itself: its heading and lines, its sizes and colors, and the rail beneath. */
const Details = ({
    product,
    heading,
    busy,
    back,
    rail,
    state,
    navigate,
}: Pick<ProductPageProps, 'state' | 'navigate'> & {
    readonly product: Product;
    readonly heading: RefObject<HTMLHeadingElement | null>;
    /** Whether the product is being asked for again, for another viewer. */
    readonly busy: boolean;
    readonly back: ReactNode;
    readonly rail: Recommended | undefined;
}) => {
    const { locale } = useStoreInfo();
    return (
        <article className="product" aria-labelledby="product-heading" aria-busy={busy}>
            {back}
            <div className="product-head">
                <Swatch color={product.colors[0]} brand={product.brand.name} size={96} />
                <div>
                    <p className="product-crumbs">
                        {product.categoryPath.map((category) => category.name).join(' / ')}
                    </p>
                    <h1 id="product-heading" className="product-name" ref={heading} tabIndex={-1}>
                        {product.name}
                    </h1>
                    <p className="product-meta">{metaLine(product)}</p>
                    <p className="product-price">
                        {formatPriceRange(product.price.min, product.price.max, locale)}
                    </p>
                    {product.price.memberPrice && (
                        <p className="product-member">{memberLine(product.price, locale)}</p>
                    )}
                    {product.membersOnly && <p className="product-member">Members only</p>}
                    {!product.inStock && <p className="product-stock">Out of stock</p>}
                </div>
            </div>
            <p className="product-description">{product.description}</p>
            <h2 id="product-variants" className="product-subheading">
                Sizes and colors
            </h2>
            <table className="variants" aria-labelledby="product-variants">
                <thead>
                    <tr>
                        <th scope="col">Color</th>
                        <th scope="col">Sizes</th>
                        <th scope="col">Price</th>
                        <th scope="col">Stock</th>
                    </tr>
                </thead>
                <tbody>
                    {variantRows(product.variants).map((row) => (
                        <tr key={row.key}>
                            <td>{row.color}</td>
                            <td>{row.sizes}</td>
                            <td>{formatMoney(row.price, locale)}</td>
                            <td>{row.stock}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {rail && <Rail rail={rail} state={state} navigate={navigate} />}
        </article>
    );
};

/**
 * The product asked for, and the answer to show for it. The answer in hand
 * stays shown while the same product is asked again, for another viewer,
 * and is never shown for another product.
 */
const useProduct = (client: GraphQLClient, sku: string) => {
    const { data, loading, error, retry } = useQuery(client, ProductDocument, { sku });
    const [answeredFor, setAnsweredFor] = useState<string>();
    if (!loading && data && answeredFor !== sku) setAnsweredFor(sku);
    const current = data !== undefined && (!loading || answeredFor === sku) ? data : undefined;
    return { data, loading, error, retry, current };
};

/**
 * A view, once the product has answered, so a missing product is not one,
 * and the rail beside it, once it has answered too.
 */
const useViewed = (client: GraphQLClient, viewed: string | undefined) => {
    const record = useRecord();
    useEffect(() => {
        if (viewed !== undefined) record({ kind: 'view', sku: viewed });
    }, [record, viewed]);
    const rail = useQuery(
        client,
        RecommendationsDocument,
        viewed === undefined ? undefined : { sku: viewed, limit: RAIL_SIZE, session: sessionId() }
    );
    // The rail in hand stays while the same product's is asked again, for another
    // viewer, and is never shown under another product, which it could hold.
    const [answeredFor, setAnsweredFor] = useState<string>();
    if (!rail.loading && rail.data && answeredFor !== viewed) setAnsweredFor(viewed);
    const current = !rail.loading || answeredFor === viewed;
    return current ? (rail.data?.recommendations ?? undefined) : undefined;
};

export const ProductPage = ({
    client,
    sku,
    state,
    navigate,
    direct = false,
    ...viewer
}: ProductPageProps) => {
    const { data, loading, error, retry, current } = useProduct(client, sku);
    const heading = useRef<HTMLHeadingElement>(null);
    const view = useRef<HTMLElement>(null);
    useProductFocus({ sku, loading, answer: data, heading, view });
    useTitle(current && (current.product?.name ?? 'No such product'));
    useOwnScroll();
    const rail = useViewed(client, data?.product?.sku);
    const back = () => {
        const { product: _dropped, ...rest } = state;
        navigate(rest);
    };
    const backButton = (
        <button type="button" className="back" onClick={back}>
            {backLabel(state, direct)}
        </button>
    );

    if (error) {
        return (
            <Bare view={view}>
                <LoadFailure what="This product" reason={error} onRetry={retry} announce={false}>
                    {backButton}
                </LoadFailure>
            </Bare>
        );
    }
    if (current === undefined) {
        return (
            // Keyed apart from the answer that replaces it, so focus lands on that answer anew.
            <Bare key="loading" view={view} line="Loading the product.">
                {backButton}
            </Bare>
        );
    }
    const { product } = current;
    if (!product) {
        return (
            <Bare
                key="missing"
                view={view}
                title="No such product"
                line={`There is no product ${sku} in this store.`}
                // Said for every missing product, so it tells a guest nothing about which exist.
                note={forMembers(viewer)}
            >
                {backButton}
            </Bare>
        );
    }
    return (
        <Details
            product={product}
            heading={heading}
            busy={loading}
            back={backButton}
            rail={rail}
            state={state}
            navigate={navigate}
        />
    );
};
