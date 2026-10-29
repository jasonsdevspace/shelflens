import type { SearchInput, SortDirection, SortField, SortInput } from '../generated/operations.js';

/**
 * The page's state is its URL.
 *
 * Everything a shopper can change on the results page, the phrase, the
 * category, each facet, the sort and the page, lives in the query string
 * and nowhere else. A filtered page can be shared, the back button undoes
 * a filter, and a reload lands where the shopper was. Nothing here touches
 * the window: parse and serialize are pure, and tested as such.
 */

export type SortKey =
    'relevance' | 'price-asc' | 'price-desc' | 'rating' | 'newest' | 'position' | 'catalog';

export interface PriceBand {
    /** In minor units, inclusive. */
    readonly from?: number;
    /** In minor units, exclusive. */
    readonly to?: number;
}

export interface SearchState {
    readonly phrase?: string;
    readonly category?: string;
    readonly brand: readonly string[];
    readonly color: readonly string[];
    readonly size: readonly string[];
    readonly price?: PriceBand;
    /** The least rating shown, "4 and up". */
    readonly rating?: number;
    readonly sort?: SortKey;
    readonly page: number;
    /** A product being looked at, over the results it was found in. */
    readonly product?: string;
    /** Whether each result says why it ranked where it did. */
    readonly explain?: boolean;
}

export const EMPTY_STATE: SearchState = { brand: [], color: [], size: [], page: 1 };

export const PAGE_SIZE = 24;

/** The sort each key means, and how the schema spells it. */
export const SORTS: Readonly<
    Record<SortKey, { readonly label: string; readonly clause: SortInput }>
> = {
    relevance: { label: 'Relevance', clause: { by: 'RELEVANCE', direction: 'DESC' } },
    'price-asc': { label: 'Price, low to high', clause: { by: 'PRICE', direction: 'ASC' } },
    'price-desc': { label: 'Price, high to low', clause: { by: 'PRICE', direction: 'DESC' } },
    rating: { label: 'Rating', clause: { by: 'RATING', direction: 'DESC' } },
    newest: { label: 'Newest', clause: { by: 'ADDED', direction: 'DESC' } },
    position: { label: 'Featured', clause: { by: 'POSITION', direction: 'ASC' } },
    catalog: { label: 'Catalog order', clause: { by: 'CATALOG', direction: 'ASC' } },
};

const SORT_KEYS = Object.keys(SORTS) as readonly SortKey[];

const isSortKey = (value: string): value is SortKey =>
    (SORT_KEYS as readonly string[]).includes(value);

/** The key for the sort the API reports it applied, after any fallback. */
export const sortKeyOf = (
    applied: readonly { readonly by: SortField; readonly direction: SortDirection }[]
): SortKey => {
    const [first] = applied;
    return (
        SORT_KEYS.find(
            (key) =>
                SORTS[key].clause.by === first?.by &&
                SORTS[key].clause.direction === first.direction
        ) ?? 'relevance'
    );
};

/** Prices travel in the URL as whole currency units, so "50-100" reads as money. */
const MINOR_UNITS = 100;

const parsePrice = (value: string | null): PriceBand | undefined => {
    const match = value?.match(/^(\d*)-(\d*)$/);
    if (!match) return undefined;
    const [, from, to] = match;
    const band: PriceBand = {
        ...(from && { from: Number(from) * MINOR_UNITS }),
        ...(to && { to: Number(to) * MINOR_UNITS }),
    };
    return band.from === undefined && band.to === undefined ? undefined : band;
};

const serializePrice = ({ from, to }: PriceBand): string =>
    `${from === undefined ? '' : from / MINOR_UNITS}-${to === undefined ? '' : to / MINOR_UNITS}`;

const positiveInteger = (value: string | null): number | undefined => {
    const parsed = Number(value);
    return value !== null && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const parseSearchState = (search: string): SearchState => {
    const params = new URLSearchParams(search);
    const phrase = params.get('q')?.trim();
    const category = params.get('category')?.trim();
    const sort = params.get('sort') ?? '';
    const rating = positiveInteger(params.get('rating'));
    const product = params.get('product')?.trim();
    const price = parsePrice(params.get('price'));
    return {
        ...(phrase && { phrase }),
        ...(category && { category }),
        brand: params.getAll('brand'),
        color: params.getAll('color'),
        size: params.getAll('size'),
        ...(price && { price }),
        ...(rating !== undefined && rating <= 5 && { rating }),
        ...(isSortKey(sort) && { sort }),
        page: positiveInteger(params.get('page')) ?? 1,
        ...(product && { product }),
        ...(params.get('explain') === '1' && { explain: true }),
    };
};

/** The query string for a state, with a leading "?" or nothing at all for the empty state. */
/**
 * The search a page answers, as a key: the phrase, the category, the
 * filters and the page, without the sort, explain mode or an open product,
 * which are ways of looking at the same page rather than a new one.
 */
export const searchKey = (state: SearchState): string => {
    const { sort: _sort, explain: _explain, product: _product, ...search } = state;
    return serializeSearchState(search);
};

export const serializeSearchState = (state: SearchState): string => {
    const params = new URLSearchParams();
    if (state.phrase) params.set('q', state.phrase);
    if (state.category) params.set('category', state.category);
    for (const name of ['brand', 'color', 'size'] as const) {
        for (const value of state[name]) params.append(name, value);
    }
    if (state.price) params.set('price', serializePrice(state.price));
    if (state.rating !== undefined) params.set('rating', String(state.rating));
    if (state.sort) params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    if (state.product) params.set('product', state.product);
    if (state.explain) params.set('explain', '1');
    const serialized = params.toString();
    return serialized ? `?${serialized}` : '';
};

/** Whether any facet narrows the results. */
export const hasFilters = (state: SearchState): boolean =>
    state.brand.length > 0 ||
    state.color.length > 0 ||
    state.size.length > 0 ||
    state.price !== undefined ||
    state.rating !== undefined;

/** How many facets narrow the results: each list counts once, a band or a rating once. */
export const activeFilterCount = (state: SearchState): number =>
    [
        state.brand.length > 0,
        state.color.length > 0,
        state.size.length > 0,
        state.price !== undefined,
        state.rating !== undefined,
    ].filter(Boolean).length;

/** The same state with every facet cleared, back on the first page. */
export const withoutFilters = (state: SearchState): SearchState => ({
    ...(state.phrase && { phrase: state.phrase }),
    ...(state.category && { category: state.category }),
    ...(state.sort && { sort: state.sort }),
    ...(state.explain && { explain: true }),
    brand: [],
    color: [],
    size: [],
    page: 1,
});

/** The request the API needs for a state. */
export const toSearchInput = (state: SearchState): SearchInput => ({
    phrase: state.phrase ?? null,
    filters: [
        ...(state.category
            ? [{ attribute: 'CATEGORY' as const, match: { eq: state.category } }]
            : []),
        ...(state.brand.length > 0
            ? [{ attribute: 'BRAND' as const, match: { in: state.brand } }]
            : []),
        ...(state.color.length > 0
            ? [{ attribute: 'COLOR' as const, match: { in: state.color } }]
            : []),
        ...(state.size.length > 0
            ? [{ attribute: 'SIZE' as const, match: { in: state.size } }]
            : []),
        ...(state.price
            ? [
                  {
                      attribute: 'PRICE' as const,
                      match: {
                          range: {
                              from: state.price.from ?? null,
                              to: state.price.to ?? null,
                          },
                      },
                  },
              ]
            : []),
        ...(state.rating !== undefined
            ? [{ attribute: 'RATING' as const, match: { range: { from: state.rating, to: null } } }]
            : []),
    ],
    sort: state.sort ? [SORTS[state.sort].clause] : null,
    page: state.page,
    pageSize: PAGE_SIZE,
});
