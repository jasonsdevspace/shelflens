import { Button } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useId, useState } from 'react';

import { type Category, type CategoryTree, childrenOf } from '../app/categories.js';
import { StateLink } from '../app/StateLink.jsx';
import { useStoreInfo } from '../app/StoreContext.jsx';
import {
    hasFilters,
    type PriceBand,
    type SearchState,
    withoutFilters,
    withoutPrice,
    withoutRating,
} from '../app/url.js';
import { count, formatCount } from '../format/count.js';
import { priceBandText } from '../format/money.js';
import type { SearchQuery } from '../generated/operations.js';
import { Stars } from './Stars.jsx';

/**
 * The facets beside the results.
 *
 * Each is a fieldset. The categories are links to their own pages, so a shopper can open one in a
 * new tab or copy it, and a plain click goes there in place. The rest are real inputs, so a
 * keyboard and a screen reader get them for free. The counts come from the API, which counts each
 * facet past its own filter: choosing "Red" never zeroes "Blue". Checking a box resets the page to
 * the first, since the old page number means nothing over a different set of results.
 */

type Facet = SearchQuery['search']['facets'][number];

export interface FacetsProps {
    readonly facets: readonly Facet[];
    readonly state: SearchState;
    readonly categories: CategoryTree;
    readonly onChange: (next: SearchState) => void;
    /** Whether the column offers to clear every filter, as the drawer on a phone does, where no chips show. */
    readonly offersClear?: boolean;
}

const LISTS = ['brand', 'color', 'size'] as const;
type ListName = (typeof LISTS)[number];

const TITLES: Readonly<Record<ListName | 'category', string>> = {
    category: 'Category',
    brand: 'Brand',
    color: 'Color',
    size: 'Size',
};

const toggled = (values: readonly string[], value: string): string[] =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

const sameBand = (a: PriceBand | undefined, b: PriceBand): boolean =>
    a !== undefined && a.from === b.from && a.to === b.to;

const bandOf = (bucket: { from: number | null; to: number | null }): PriceBand => ({
    ...(bucket.from !== null && { from: bucket.from }),
    ...(bucket.to !== null && { to: bucket.to }),
});

/** How many results a choice gives: a number to see, and what it counts to hear. */
const FacetCount = ({ n }: { readonly n: number }) => {
    const { locale } = useStoreInfo();
    return (
        <span className="hint">
            <span aria-hidden="true">{formatCount(n, locale)}</span>
            <span className="visually-hidden">{`, ${count(n, 'result', 'results', locale)}`}</span>
        </span>
    );
};

const Group = ({
    title,
    id,
    name,
    children,
}: {
    readonly title: string;
    readonly id?: string | undefined;
    /** The facet's own name, so the tour can point at it. */
    readonly name: string;
    readonly children: ReactNode;
}) => (
    <fieldset className="facet" id={id} data-facet={name}>
        <legend className="facet-title">{title}</legend>
        {children}
    </fieldset>
);

/** The way up from a category: to its parent, or from a root category to every category. */
const upFrom = (state: SearchState, parent: Category | undefined): SearchState => {
    if (parent) return { ...state, category: parent.id, page: 1 };
    // Above every category, a category's own order means nothing, so it goes too.
    const { category: _category, sort, ...rest } = state;
    return { ...rest, ...(sort && sort !== 'position' && { sort }), page: 1 };
};

const CategoryFacet = ({
    facet,
    state,
    categories,
    onChange,
}: FacetsProps & { readonly facet: Facet }) => {
    if (!('buckets' in facet)) return null;
    const counts = new Map(facet.buckets.map((bucket) => [bucket.value, bucket.count]));
    const next = childrenOf(categories, state.category).flatMap((category) => {
        const n = counts.get(category.id);
        return n === undefined ? [] : [{ category, n }];
    });
    // Where the shopper is, with the way up above it, so the group never goes away at a leaf.
    const current = state.category === undefined ? undefined : categories.get(state.category);
    const parentId = current && current.path.length > 1 ? current.path.at(-2) : undefined;
    const parent = parentId === undefined ? undefined : categories.get(parentId);
    if (next.length === 0 && !current) return null;
    return (
        <Group title={TITLES.category} name="category">
            {current && (
                <>
                    <StateLink
                        to={upFrom(state, parent)}
                        navigate={onChange}
                        className="option-button facet-up"
                    >
                        <span aria-hidden="true">‹</span> {parent ? parent.name : 'All categories'}
                    </StateLink>
                    {/* The breadcrumb names the page. This says where in the categories the shopper is. */}
                    <span className="facet-current" aria-current="location">
                        {current.name}
                    </span>
                </>
            )}
            <ul className={current ? 'facet-links is-nested' : 'facet-links'}>
                {next.map(({ category, n }) => (
                    <li key={category.id}>
                        <StateLink
                            to={{ ...state, category: category.id, page: 1 }}
                            navigate={onChange}
                            className="option-button"
                        >
                            <span className="facet-label">{category.name}</span>
                            <FacetCount n={n} />
                        </StateLink>
                    </li>
                ))}
            </ul>
        </Group>
    );
};

/** How many of a list show before the rest are a click away. */
const SHOWN = 6;

const ListFacet = ({
    facet,
    name,
    state,
    onChange,
}: FacetsProps & { readonly facet: Facet | undefined; readonly name: ListName }) => {
    const id = useId();
    const [all, setAll] = useState(false);
    // Entries past the first few that a tick brought into view. They stay until the list
    // is folded again, so unticking one does not pull the control out from under focus.
    const [revealed, setRevealed] = useState<readonly string[]>([]);
    const ticked = state[name].filter((value) => !revealed.includes(value));
    if (ticked.length > 0) setRevealed([...revealed, ...ticked]);
    const answered = facet && 'buckets' in facet ? facet.buckets : [];
    // A ticked value nothing else matches stays in its group, checked, so it can be unticked.
    const stranded = state[name]
        .filter((value) => !answered.some((bucket) => bucket.value === value))
        .map((value): { value: string; count?: number } => ({ value }));
    const listed = [...answered, ...stranded];
    if (listed.length === 0) return null;
    const buckets = all
        ? listed
        : listed.filter((bucket, index) => index < SHOWN || revealed.includes(bucket.value));
    const title = TITLES[name];
    const fold = () => {
        setAll(!all);
        setRevealed(state[name]);
    };
    return (
        <Group title={title} id={id} name={name}>
            {buckets.map((bucket) => (
                <label key={bucket.value} className="facet-option">
                    <input
                        type="checkbox"
                        name={name}
                        value={bucket.value}
                        checked={state[name].includes(bucket.value)}
                        onChange={() =>
                            onChange({
                                ...state,
                                [name]: toggled(state[name], bucket.value),
                                page: 1,
                            })
                        }
                    />
                    <span className="facet-label">{bucket.value}</span>
                    {/* A ticked value the answer left out has no count to show. */}
                    {bucket.count !== undefined && <FacetCount n={bucket.count} />}
                </label>
            ))}
            {listed.length > SHOWN && (
                <Button text aria-expanded={all} aria-controls={id} onClick={fold}>
                    {all
                        ? `Show fewer ${title.toLowerCase()}s`
                        : `Show all ${listed.length} ${title.toLowerCase()}s`}
                </Button>
            )}
        </Group>
    );
};

const PriceFacet = ({ facet, state, onChange }: FacetsProps & { readonly facet: Facet }) => {
    const store = useStoreInfo();
    if (!('ranges' in facet)) return null;
    const bands = facet.ranges.filter((bucket) => bucket.count > 0);
    if (bands.length === 0) return null;
    const choose = (price: PriceBand | undefined) =>
        onChange(price ? { ...state, price, page: 1 } : withoutPrice(state));
    return (
        <Group title="Price" name="price">
            <label className="facet-option">
                <input
                    type="radio"
                    name="price"
                    checked={state.price === undefined}
                    onChange={() => choose(undefined)}
                />
                <span className="facet-label">Any price</span>
            </label>
            {bands.map((bucket) => {
                const band = bandOf(bucket);
                const text = priceBandText(band, store.currency, store.locale);
                return (
                    <label key={text} className="facet-option">
                        <input
                            type="radio"
                            name="price"
                            checked={sameBand(state.price, band)}
                            onChange={() => choose(band)}
                        />
                        <span className="facet-label">{text}</span>
                        <FacetCount n={bucket.count} />
                    </label>
                );
            })}
        </Group>
    );
};

/**
 * The rating bands worth offering, strictest first. A looser band that finds
 * no more than the stricter one before it adds nothing to choose, unless it
 * is the one chosen. It is not "Any rating", which also keeps what nobody rated.
 */
export const distinctBands = <T extends { readonly from: number; readonly count: number }>(
    bands: readonly T[],
    chosen: number | undefined
): T[] =>
    bands.filter(
        (band, index) =>
            index === 0 || band.count !== bands[index - 1]?.count || chosen === band.from
    );

const RatingFacet = ({ facet, state, onChange }: FacetsProps & { readonly facet: Facet }) => {
    const { locale } = useStoreInfo();
    if (!('ranges' in facet)) return null;
    const counted = facet.ranges.flatMap((bucket) =>
        bucket.count > 0 && bucket.from !== null ? [{ ...bucket, from: bucket.from }] : []
    );
    // A rating the address chose that no band counts stays shown, chosen, so the column and the
    // chip above the results agree on what is on and it can be cleared here too.
    const chosen = state.rating;
    const stranded =
        chosen !== undefined && !counted.some((bucket) => bucket.from === chosen)
            ? [{ from: chosen, count: undefined }]
            : [];
    const bands: { from: number; count: number | undefined }[] = [
        ...distinctBands(counted, chosen),
        ...stranded,
    ].sort((a, b) => b.from - a.from);
    if (bands.length === 0) return null;
    const choose = (rating: number | undefined) =>
        onChange(rating !== undefined ? { ...state, rating, page: 1 } : withoutRating(state));
    return (
        <Group title="Rating" name="rating">
            <label className="facet-option">
                <input
                    type="radio"
                    name="rating"
                    checked={state.rating === undefined}
                    onChange={() => choose(undefined)}
                />
                <span className="facet-label">Any rating</span>
            </label>
            {bands.map((bucket) => (
                <label key={bucket.from} className="facet-option">
                    <input
                        type="radio"
                        name="rating"
                        checked={state.rating === bucket.from}
                        onChange={() => choose(bucket.from)}
                    />
                    {/*
                     * Seen, the stars a card shows at that rating, then "and up". Heard, the
                     * stars are their number in words, so the band is said in full once.
                     */}
                    <span className="facet-label facet-rating">
                        <Stars average={bucket.from} />
                        <span>
                            <span className="visually-hidden">
                                {count(bucket.from, 'star', 'stars', locale)}
                            </span>
                            {/* The space is outside the hidden words, so the name keeps it. */}
                            {' and up'}
                        </span>
                    </span>
                    {bucket.count !== undefined && <FacetCount n={bucket.count} />}
                </label>
            ))}
        </Group>
    );
};

export const Facets = (props: FacetsProps) => {
    const { facets, state, onChange, offersClear = false } = props;
    const byName = new Map(facets.map((facet) => [facet.name, facet]));
    const facetFor = (name: string) => byName.get(name);
    const category = facetFor('category');
    const price = facetFor('price');
    const rating = facetFor('rating');
    return (
        <form
            className="facets"
            aria-label="Narrow the results"
            onSubmit={(event) => event.preventDefault()}
        >
            {offersClear && hasFilters(state) && (
                <Button text onClick={() => onChange(withoutFilters(state))}>
                    Clear all filters
                </Button>
            )}
            {category && <CategoryFacet {...props} facet={category} />}
            {LISTS.map((name) => {
                const facet = facetFor(name);
                return facet || state[name].length > 0 ? (
                    <ListFacet key={name} {...props} facet={facet} name={name} />
                ) : null;
            })}
            {price && <PriceFacet {...props} facet={price} />}
            {rating && <RatingFacet {...props} facet={rating} />}
        </form>
    );
};
