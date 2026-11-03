import { useEffect, useRef } from 'react';

import { type StoreInfo, useStoreInfo } from '../app/StoreContext.jsx';
import { hasFilters, type SearchState, withoutFilters } from '../app/url.js';
import { priceLabel, ratingLabel } from './Facets.jsx';

/** One filter that is on, as a chip says it, and the state without it. */
interface Applied {
    readonly key: string;
    readonly label: string;
    readonly without: SearchState;
}

/** Every filter that is on, in the order the column lists them, each with the state that drops it. */
const appliedFilters = (state: SearchState, store: StoreInfo): Applied[] => {
    const lists = (['brand', 'color', 'size'] as const).flatMap((name) =>
        state[name].map((value) => ({
            key: `${name}:${value}`,
            label: value,
            without: { ...state, [name]: state[name].filter((other) => other !== value), page: 1 },
        }))
    );
    const { price, rating, ...rest } = state;
    return [
        ...lists,
        ...(price
            ? [
                  {
                      key: 'price',
                      label: priceLabel(price, store),
                      without: { ...rest, ...(rating !== undefined && { rating }), page: 1 },
                  },
              ]
            : []),
        ...(rating !== undefined
            ? [
                  {
                      key: 'rating',
                      label: ratingLabel(rating, store.locale),
                      without: { ...rest, ...(price && { price }), page: 1 },
                  },
              ]
            : []),
    ];
};

/**
 * The filters that are on, under the results heading, each a chip that
 * removes itself, then the way to clear them all. Focus goes to the chip
 * that takes the removed one's place, or to the results heading once none
 * is left, so a keyboard is never left on nothing.
 */
export const FilterChips = ({
    state,
    navigate,
    heading,
}: {
    readonly state: SearchState;
    readonly navigate: (next: SearchState) => void;
    /** The results heading's id, where focus goes once no chip is left. */
    readonly heading: string;
}) => {
    const store = useStoreInfo();
    const list = useRef<HTMLUListElement>(null);
    // The place of the chip just pressed, until the state without it has drawn.
    const removed = useRef<number | undefined>(undefined);
    const applied = appliedFilters(state, store);
    useEffect(() => {
        if (removed.current === undefined) return;
        const chips = list.current?.querySelectorAll<HTMLButtonElement>('.chip') ?? [];
        const next = chips[Math.min(removed.current, chips.length - 1)];
        (next ?? document.getElementById(heading))?.focus();
        removed.current = undefined;
    }, [heading, state]);
    if (!hasFilters(state)) return null;
    return (
        <ul ref={list} className="chips" aria-label="Filters on">
            {applied.map((filter, index) => (
                <li key={filter.key}>
                    <button
                        type="button"
                        className="chip"
                        aria-label={`Remove ${filter.label}`}
                        onClick={() => {
                            removed.current = index;
                            navigate(filter.without);
                        }}
                    >
                        {filter.label}
                        <span className="chip-x" aria-hidden="true">
                            ×
                        </span>
                    </button>
                </li>
            ))}
            <li>
                <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                        removed.current = 0;
                        navigate(withoutFilters(state));
                    }}
                >
                    Clear all
                </button>
            </li>
        </ul>
    );
};
