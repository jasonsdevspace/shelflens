import { type KeyboardEvent, useId, useMemo, useState } from 'react';

import { useStoreInfo } from '../app/StoreContext.jsx';
import type { GraphQLClient } from '../client/graphql.js';
import { formatPriceRange } from '../format/money.js';
import { Swatch } from './Swatch.jsx';
import { isAskable, type Suggestions, useSuggestions } from './useSuggestions.js';

/**
 * The search box and its popover, as one combobox.
 *
 * The input owns focus the whole time. The popover is a listbox the input
 * controls, the highlighted option is announced through
 * aria-activedescendant, and the arrow keys, Enter and Escape do what a
 * shopper with a keyboard or a screen reader expects. Suggested queries
 * come first, then products with a thumbnail and the viewer's price.
 */

export interface SearchBoxProps {
    readonly client: GraphQLClient;
    /** The shopper submitted a phrase, typed or chosen from the suggestions. */
    readonly onSearch: (phrase: string) => void;
    /** The shopper chose a product. */
    readonly onPick: (sku: string) => void;
    readonly placeholder?: string;
    /** What the box starts with, when the page already has a phrase. */
    readonly initialPhrase?: string;
}

type Option =
    | { readonly kind: 'query'; readonly phrase: string }
    | { readonly kind: 'product'; readonly product: Suggestions['products'][number]['product'] };

const optionsOf = (suggestions: Suggestions | undefined): readonly Option[] =>
    suggestions
        ? [
              ...suggestions.queries.map((phrase): Option => ({ kind: 'query', phrase })),
              ...suggestions.products.map(({ product }): Option => ({ kind: 'product', product })),
          ]
        : [];

export const SearchBox = ({
    client,
    onSearch,
    onPick,
    placeholder,
    initialPhrase = '',
}: SearchBoxProps) => {
    const { locale } = useStoreInfo();
    const id = useId();
    const [phrase, setPhrase] = useState(initialPhrase);
    // The page's phrase changes under the box when a search lands or history moves. The
    // box follows it without being remounted, so focus stays where the visitor put it.
    const [followed, setFollowed] = useState(initialPhrase);
    if (followed !== initialPhrase) {
        setFollowed(initialPhrase);
        setPhrase(initialPhrase);
    }
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const { answered, loading, error } = useSuggestions(client, phrase);

    const options = useMemo(() => optionsOf(answered?.suggestions), [answered]);
    const expanded = open && isAskable(phrase) && (options.length > 0 || loading);
    const listId = `${id}-listbox`;
    const optionId = (index: number) => `${id}-option-${index}`;

    const choose = (option: Option) => {
        setOpen(false);
        setActive(-1);
        if (option.kind === 'query') {
            setPhrase(option.phrase);
            onSearch(option.phrase);
        } else {
            onPick(option.product.sku);
        }
    };

    const submit = () => {
        const chosen = options[active];
        if (chosen) {
            choose(chosen);
        } else if (phrase.trim()) {
            setOpen(false);
            onSearch(phrase.trim());
        }
    };

    const move = (step: number) => {
        if (options.length === 0) return;
        setOpen(true);
        // Cycles through the options and the "nothing highlighted" state before them.
        const states = options.length + 1;
        setActive((current) => ((current + 1 + step + states) % states) - 1);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                move(1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                move(-1);
                break;
            case 'Enter':
                event.preventDefault();
                submit();
                break;
            case 'Escape':
                if (expanded) {
                    event.preventDefault();
                    setOpen(false);
                    setActive(-1);
                }
                break;
            default:
                break;
        }
    };

    // Announced only while the popover is open, so a landed search is not talked over
    // by a suggestion count the visitor did not ask for.
    const status = !expanded
        ? ''
        : loading && options.length === 0
          ? 'Searching'
          : (error ?? `${options.length} suggestions`);

    return (
        <div className="searchbox">
            <label className="searchbox-label" htmlFor={`${id}-input`}>
                Search the store
            </label>
            <input
                id={`${id}-input`}
                className="searchbox-input"
                type="search"
                enterKeyHint="search"
                role="combobox"
                autoComplete="off"
                spellCheck={false}
                placeholder={placeholder ?? 'Search products'}
                value={phrase}
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={active >= 0 && expanded ? optionId(active) : undefined}
                onChange={(event) => {
                    setPhrase(event.target.value);
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    setOpen(false);
                    setActive(-1);
                }}
                onKeyDown={onKeyDown}
            />
            <div className="searchbox-status" role="status" aria-live="polite">
                {status}
            </div>
            <ul
                id={listId}
                className="searchbox-popover"
                role="listbox"
                aria-label="Suggestions"
                hidden={!expanded}
            >
                {options.map((option, index) => (
                    <li
                        key={
                            option.kind === 'query'
                                ? `q:${option.phrase}`
                                : `p:${option.product.sku}`
                        }
                        id={optionId(index)}
                        role="option"
                        aria-selected={index === active}
                        className={`searchbox-option searchbox-option-${option.kind}${
                            index === active ? ' is-active' : ''
                        }`}
                        onMouseDown={(event) => {
                            // Before the input's blur, so the choice is not lost to the close.
                            event.preventDefault();
                            choose(option);
                        }}
                        onMouseEnter={() => setActive(index)}
                    >
                        {option.kind === 'query' ? (
                            <span className="searchbox-query">{option.phrase}</span>
                        ) : (
                            <>
                                <Swatch
                                    color={option.product.colors[0]}
                                    brand={option.product.brand.name}
                                />
                                <span className="searchbox-product">
                                    <span className="searchbox-product-name">
                                        {option.product.name}
                                    </span>
                                    <span className="searchbox-product-meta">
                                        {option.product.brand.name}
                                        {' · '}
                                        {formatPriceRange(
                                            option.product.price.min,
                                            option.product.price.max,
                                            locale
                                        )}
                                    </span>
                                </span>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};
