import { Button } from '@jasonsdevspace/design-kit/react';
import { useEffect, useRef } from 'react';

import { type StoreInfo, useStoreInfo } from '../app/StoreContext.jsx';
import {
    type SearchState,
    serializeSearchState,
    withoutFilters,
    withoutPrice,
    withoutRating,
    withoutValue,
} from '../app/url.js';
import type { Navigate } from '../app/useUrlState.js';
import { priceBandText } from '../format/money.js';
import { ratingBandText } from '../format/rating.js';

/** One filter that is on, as its chip shows it and a screen reader names it, and the state without it. */
interface Applied {
    readonly key: string;
    readonly label: string;
    /** What the filter is, so two values alike in different facets are told apart. */
    readonly facet: string;
    readonly without: SearchState;
}

/** Every filter that is on, in the order the column lists them, each with the state that drops it. */
const appliedFilters = (state: SearchState, store: StoreInfo): Applied[] => [
    ...(['brand', 'color', 'size'] as const).flatMap((name) =>
        state[name].map((value) => ({
            key: `${name}:${value}`,
            label: value,
            facet: name,
            without: withoutValue(state, name, value),
        }))
    ),
    ...(state.price
        ? [
              {
                  key: 'price',
                  label: priceBandText(state.price, store.currency, store.locale),
                  facet: 'price',
                  without: withoutPrice(state),
              },
          ]
        : []),
    ...(state.rating !== undefined
        ? [
              {
                  key: 'rating',
                  label: ratingBandText(state.rating, store.locale),
                  facet: 'rating',
                  without: withoutRating(state),
              },
          ]
        : []),
];

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
    readonly navigate: Navigate;
    /** The results heading's id, where focus goes once no chip is left. */
    readonly heading: string;
}) => {
    const store = useStoreInfo();
    const list = useRef<HTMLUListElement>(null);
    // The place of the chip just pressed, and the state it asked for. Focus moves only once that
    // state has drawn, and the wish goes at the next change whatever it is.
    const removed = useRef<{ readonly index: number; readonly to: string } | undefined>(undefined);
    const applied = appliedFilters(state, store);
    useEffect(() => {
        const wish = removed.current;
        removed.current = undefined;
        if (wish?.to !== serializeSearchState(state)) return;
        const chips = list.current?.querySelectorAll<HTMLButtonElement>('.chip') ?? [];
        const next = chips[Math.min(wish.index, chips.length - 1)];
        (next ?? document.getElementById(heading))?.focus();
    }, [heading, state]);
    if (applied.length === 0) return null;
    return (
        <ul ref={list} className="chips" aria-label="Filters on">
            {applied.map((filter, index) => (
                <li key={filter.key}>
                    <button
                        type="button"
                        className="chip"
                        aria-label={`Remove ${filter.facet} ${filter.label}`}
                        onClick={() => {
                            removed.current = { index, to: serializeSearchState(filter.without) };
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
                <Button
                    text
                    onClick={() => {
                        const cleared = withoutFilters(state);
                        removed.current = { index: 0, to: serializeSearchState(cleared) };
                        navigate(cleared);
                    }}
                >
                    Clear all
                </Button>
            </li>
        </ul>
    );
};
