import { useId, useState } from 'react';

import { type CategoryTree, childrenOf } from '../app/categories.js';
import { type StoreInfo, useStoreInfo } from '../app/StoreContext.jsx';
import { hasFilters, type PriceBand, type SearchState, withoutFilters } from '../app/url.js';
import { formatMoney } from '../format/money.js';
import type { SearchQuery } from '../generated/operations.js';

/**
 * The facets beside the results.
 *
 * Each is a fieldset of real inputs, so a keyboard and a screen reader get
 * them for free. The counts come from the API, which counts each facet
 * past its own filter: choosing "Red" never zeroes "Blue". Checking a box
 * resets the page to the first, since the old page number means nothing
 * over a different set of results.
 */

export type Facet = SearchQuery['search']['facets'][number];

export interface FacetsProps {
    readonly facets: readonly Facet[];
    readonly state: SearchState;
    readonly categories: CategoryTree;
    readonly onChange: (next: SearchState) => void;
}

const TITLES: Readonly<Record<string, string>> = {
    category: 'Category',
    brand: 'Brand',
    color: 'Color',
    size: 'Size',
    price: 'Price',
    rating: 'Rating',
};

const LISTS = ['brand', 'color', 'size'] as const;
type ListName = (typeof LISTS)[number];

const isList = (name: string): name is ListName => (LISTS as readonly string[]).includes(name);

const toggled = (values: readonly string[], value: string): string[] =>
    values.includes(value) ? values.filter((v) => v !== value) : [...values, value];

const sameBand = (a: PriceBand | undefined, b: PriceBand): boolean =>
    a !== undefined && a.from === b.from && a.to === b.to;

const bandOf = (bucket: { from: number | null; to: number | null }): PriceBand => ({
    ...(bucket.from !== null && { from: bucket.from }),
    ...(bucket.to !== null && { to: bucket.to }),
});

const priceLabel = (band: PriceBand, { currency, locale }: StoreInfo): string => {
    const money = (amount: number) => formatMoney({ amount, currency }, locale);
    if (band.from === undefined && band.to !== undefined) return `Under ${money(band.to)}`;
    if (band.from !== undefined && band.to === undefined) return `${money(band.from)} and up`;
    if (band.from !== undefined && band.to !== undefined)
        return `${money(band.from)} to ${money(band.to)}`;
    return 'Any price';
};

const Group = ({
    title,
    id,
    children,
}: {
    readonly title: string;
    readonly id?: string | undefined;
    readonly children: React.ReactNode;
}) => (
    <fieldset className="facet" id={id}>
        <legend className="facet-title">{title}</legend>
        {children}
    </fieldset>
);

const CategoryFacet = ({
    facet,
    state,
    categories,
    onChange,
}: FacetsProps & { readonly facet: Facet }) => {
    if (!('buckets' in facet)) return null;
    const counts = new Map(facet.buckets.map((bucket) => [bucket.value, bucket.count]));
    const next = childrenOf(categories, state.category).filter((category) =>
        counts.has(category.id)
    );
    if (next.length === 0) return null;
    return (
        <Group title={TITLES.category ?? 'Category'}>
            <ul className="facet-links">
                {next.map((category) => (
                    <li key={category.id}>
                        <button
                            type="button"
                            className="facet-link"
                            onClick={() => onChange({ ...state, category: category.id, page: 1 })}
                        >
                            <span className="facet-label">{category.name}</span>
                            <span className="facet-count">{counts.get(category.id)}</span>
                        </button>
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
    const title = TITLES[name] ?? name;
    const fold = () => {
        setAll(!all);
        setRevealed(state[name]);
    };
    return (
        <Group title={title} id={id}>
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
                    {bucket.count !== undefined && (
                        <span className="facet-count">{bucket.count}</span>
                    )}
                </label>
            ))}
            {listed.length > SHOWN && (
                <button
                    type="button"
                    className="facet-more"
                    aria-expanded={all}
                    aria-controls={id}
                    onClick={fold}
                >
                    {all ? 'Show fewer' : `Show all ${listed.length} ${title.toLowerCase()}s`}
                </button>
            )}
        </Group>
    );
};

const PriceFacet = ({ facet, state, onChange }: FacetsProps & { readonly facet: Facet }) => {
    const store = useStoreInfo();
    if (!('ranges' in facet)) return null;
    const bands = facet.ranges.filter((bucket) => bucket.count > 0);
    if (bands.length === 0) return null;
    const choose = (price: PriceBand | undefined) => {
        const { price: _dropped, ...rest } = state;
        onChange({ ...rest, ...(price && { price }), page: 1 });
    };
    return (
        <Group title="Price">
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
                return (
                    <label key={priceLabel(band, store)} className="facet-option">
                        <input
                            type="radio"
                            name="price"
                            checked={sameBand(state.price, band)}
                            onChange={() => choose(band)}
                        />
                        <span className="facet-label">{priceLabel(band, store)}</span>
                        <span className="facet-count">{bucket.count}</span>
                    </label>
                );
            })}
        </Group>
    );
};

const RatingFacet = ({ facet, state, onChange }: FacetsProps & { readonly facet: Facet }) => {
    if (!('ranges' in facet)) return null;
    const bands = facet.ranges.filter((bucket) => bucket.count > 0 && bucket.from !== null);
    if (bands.length === 0) return null;
    const choose = (rating: number | undefined) => {
        const { rating: _dropped, ...rest } = state;
        onChange({ ...rest, ...(rating !== undefined && { rating }), page: 1 });
    };
    return (
        <Group title="Rating">
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
                        onChange={() => choose(bucket.from ?? undefined)}
                    />
                    <span className="facet-label">{bucket.from} and up</span>
                    <span className="facet-count">{bucket.count}</span>
                </label>
            ))}
        </Group>
    );
};

export const Facets = (props: FacetsProps) => {
    const { facets, state, onChange } = props;
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
            {hasFilters(state) && (
                <button
                    type="button"
                    className="facets-clear"
                    onClick={() => onChange(withoutFilters(state))}
                >
                    Clear all filters
                </button>
            )}
            {category && <CategoryFacet {...props} facet={category} />}
            {LISTS.map((name) => {
                const facet = facetFor(name);
                return (facet || state[name].length > 0) && isList(name) ? (
                    <ListFacet key={name} {...props} facet={facet} name={name} />
                ) : null;
            })}
            {price && <PriceFacet {...props} facet={price} />}
            {rating && <RatingFacet {...props} facet={rating} />}
        </form>
    );
};
