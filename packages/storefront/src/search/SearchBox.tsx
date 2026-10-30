import {
    type FocusEvent,
    type KeyboardEvent,
    type ReactNode,
    type RefObject,
    useEffect,
    useId,
    useMemo,
    useRef,
    useState,
} from 'react';

import { useStoreInfo } from '../app/StoreContext.jsx';
import type { GraphQLClient } from '../client/graphql.js';
import { count } from '../format/count.js';
import { formatPriceRange } from '../format/money.js';
import {
    clearRecentSearches,
    fold,
    matchingRecent,
    refreshRecentSearches,
    useRecentSearches,
} from './recent.js';
import { Swatch } from './Swatch.jsx';
import { isAskable, type Suggestions, useSuggestions } from './useSuggestions.js';

/**
 * The search box and its popover, as one combobox.
 *
 * The input owns focus the whole time. The popover is a listbox the input
 * controls, the highlighted option is announced through
 * aria-activedescendant, and the arrow keys, Enter and Escape do what a
 * shopper with a keyboard or a screen reader expects. What this browser
 * searched before comes first, filtered by what is typed, under a heading
 * that says so and a button that clears it. Then the store's suggested
 * queries, then products with a thumbnail and the viewer's price.
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
    | { readonly kind: 'recent'; readonly phrase: string }
    | { readonly kind: 'query'; readonly phrase: string }
    | { readonly kind: 'product'; readonly product: Suggestions['products'][number]['product'] };

/** How many recent phrases sit above the suggestions once there are suggestions to show. */
const RECENT_BESIDE_SUGGESTIONS = 3;

/** The options in order: recent phrases, suggested queries not already among them, products. */
const optionsOf = (
    recent: readonly string[],
    suggestions: Suggestions | undefined
): readonly Option[] => {
    const shown = suggestions ? recent.slice(0, RECENT_BESIDE_SUGGESTIONS) : recent;
    const seen = new Set(shown.map(fold));
    return [
        ...shown.map((phrase): Option => ({ kind: 'recent', phrase })),
        ...(suggestions?.queries ?? [])
            .filter((phrase) => !seen.has(fold(phrase)))
            .map((phrase): Option => ({ kind: 'query', phrase })),
        ...(suggestions?.products ?? []).map(({ product }): Option => ({
            kind: 'product',
            product,
        })),
    ];
};

const keyOf = (option: Option): string =>
    option.kind === 'product' ? `p:${option.product.sku}` : `${option.kind[0]}:${option.phrase}`;

/** What the popover lists for the phrase: the matching recent phrases, then the store's suggestions. */
const usePopover = (
    recent: readonly string[],
    phrase: string,
    askable: boolean,
    suggestions: Suggestions | undefined
) => {
    const matching = useMemo(() => matchingRecent(recent, phrase), [recent, phrase]);
    const options = useMemo(() => optionsOf(matching, suggestions), [matching, suggestions]);
    const recentCount = options.filter((option) => option.kind === 'recent').length;
    return {
        options,
        recentCount,
        // Recent phrases alone, with their heading and the way to clear them, until two
        // characters are typed and the store is asked. Deciding on the typing rather than
        // on the answer keeps the heading in place while the answer is on its way.
        recentOnly: !askable && recentCount > 0,
    };
};

interface Choosing {
    readonly options: readonly Option[];
    readonly active: number;
    readonly phrase: string;
    readonly onSearch: (phrase: string) => void;
    readonly onPick: (sku: string) => void;
    readonly setPhrase: (phrase: string) => void;
    readonly setOpen: (open: boolean) => void;
    readonly setActive: (update: (current: number) => number) => void;
}

/** Choosing an option, submitting the box, and moving the highlight through the options. */
const useChoosing = ({
    options,
    active,
    phrase,
    onSearch,
    onPick,
    setPhrase,
    setOpen,
    setActive,
}: Choosing) => {
    const choose = (option: Option) => {
        setOpen(false);
        setActive(() => -1);
        if (option.kind === 'product') {
            onPick(option.product.sku);
        } else {
            setPhrase(option.phrase);
            onSearch(option.phrase);
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
    return { choose, submit, move };
};

interface Keyed {
    readonly move: (step: number) => void;
    readonly submit: () => void;
    readonly close: () => void;
}

/**
 * What each key does in the box. Escape is always handled here: a search
 * field would otherwise clear itself on Escape, wiping the phrase the
 * visitor just searched for.
 */
const KEYS: Readonly<Record<string, (keyed: Keyed) => void>> = {
    ArrowDown: ({ move }) => move(1),
    ArrowUp: ({ move }) => move(-1),
    Enter: ({ submit }) => submit(),
    Escape: ({ close }) => close(),
};

/**
 * Keeps the highlighted option in view as the arrow keys move it through a
 * long list. The pointer is left alone: scrolling under it would change
 * which option it rests on.
 */
const useScrolledIntoView = (elementId: string | undefined, byKeys: RefObject<boolean>) => {
    useEffect(() => {
        if (elementId && byKeys.current) {
            document.getElementById(elementId)?.scrollIntoView({ block: 'nearest' });
        }
    }, [elementId, byKeys]);
};

interface Said {
    readonly notice: string;
    readonly open: boolean;
    readonly askable: boolean;
    readonly loading: boolean;
    readonly error: string | undefined;
    /** How many of the shopper's own phrases are listed. */
    readonly recent: number;
    /** How many of the store's suggestions are listed. */
    readonly suggested: number;
}

/**
 * What the status line says. Only while the popover is open, so a landed search
 * is not talked over by a count the visitor did not ask for. While it is open, a
 * count of none and an error are news too. A clear is said once, whatever else
 * is true.
 */
const statusOf = ({ notice, open, askable, loading, error, recent, suggested }: Said): string => {
    if (notice) return notice;
    if (!open) return '';
    if (!askable) return recent > 0 ? count(recent, 'recent search', 'recent searches') : '';
    // A failure is news before a wait is: nothing is coming.
    if (error) return error;
    if (loading && suggested === 0) return 'Searching';
    if (suggested > 0) return count(suggested, 'suggestion', 'suggestions');
    return recent > 0 ? count(recent, 'recent search', 'recent searches') : '0 suggestions';
};

const OptionRow = ({
    option,
    id,
    active,
    locale,
    onChoose,
    onHover,
}: {
    readonly option: Option;
    readonly id: string;
    readonly active: boolean;
    readonly locale: string;
    readonly onChoose: (option: Option) => void;
    readonly onHover: () => void;
}) => (
    <li
        id={id}
        role="option"
        aria-selected={active}
        className={`searchbox-option searchbox-option-${option.kind}${active ? ' is-active' : ''}`}
        onMouseDown={(event) => {
            // Before the input's blur, so the choice is not lost to the close.
            event.preventDefault();
            onChoose(option);
        }}
        onMouseEnter={onHover}
    >
        {option.kind === 'product' ? (
            <>
                <Swatch color={option.product.colors[0]} brand={option.product.brand.name} />
                <span className="searchbox-product">
                    <span className="searchbox-product-name">{option.product.name}</span>
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
        ) : (
            <span className="searchbox-query">{option.phrase}</span>
        )}
    </li>
);

/** Recent phrases beside suggestions are a group of their own, so a screen reader hears where the shopper's own history ends. */
const Group = ({
    id,
    title,
    children,
}: {
    readonly id: string;
    readonly title: string;
    readonly children: ReactNode;
}) => (
    <li role="group" aria-labelledby={id}>
        <div id={id} role="presentation" className="searchbox-group-title">
            {title}
        </div>
        <ul role="presentation" className="searchbox-group">
            {children}
        </ul>
    </li>
);

const RecentHead = ({
    headingId,
    onClear,
    onBlur,
    onEscape,
}: {
    readonly headingId: string;
    readonly onClear: () => void;
    readonly onBlur: (event: FocusEvent) => void;
    readonly onEscape: () => void;
}) => (
    <div className="searchbox-head">
        <span id={headingId} className="searchbox-heading">
            Recent searches
        </span>
        <button
            type="button"
            className="searchbox-clear"
            aria-label="Clear recent searches"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClear}
            onBlur={onBlur}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                onEscape();
            }}
        >
            Clear
        </button>
    </div>
);

export const SearchBox = ({
    client,
    onSearch,
    onPick,
    placeholder,
    initialPhrase = '',
}: SearchBoxProps) => {
    const { locale } = useStoreInfo();
    const id = useId();
    const input = useRef<HTMLInputElement>(null);
    const popover = useRef<HTMLDivElement>(null);
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
    // Said once after the recent searches are cleared, ahead of the usual count.
    const [notice, setNotice] = useState('');
    const { answered, loading, error } = useSuggestions(client, phrase);
    const recent = useRecentSearches();

    const askable = isAskable(phrase);
    const { options, recentCount, recentOnly } = usePopover(
        recent,
        phrase,
        askable,
        answered?.suggestions
    );
    const expanded = open && (options.length > 0 || (askable && loading));
    const listId = `${id}-listbox`;
    const headingId = `${id}-recent`;
    const optionId = (index: number) => `${id}-option-${index}`;

    const activeId = active >= 0 ? optionId(active) : undefined;
    const byKeys = useRef(false);
    const close = () => {
        setNotice('');
        setOpen(false);
        setActive(-1);
    };
    /** Opening by the keys says the count again, so a clear said once is not said over a list. */
    const openBy = (next: boolean) => {
        if (next) setNotice('');
        setOpen(next);
    };
    useScrolledIntoView(activeId, byKeys);
    // The list is named by the visible heading while it is the shopper's own history.
    const naming = recentOnly ? { 'aria-labelledby': headingId } : { 'aria-label': 'Suggestions' };

    const { choose, submit, move } = useChoosing({
        options,
        active,
        phrase,
        onSearch,
        onPick,
        setPhrase,
        setOpen: openBy,
        setActive: (update) => {
            byKeys.current = true;
            setActive(update);
        },
    });

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        const action = KEYS[event.key];
        if (!action) return;
        event.preventDefault();
        action({ move, submit, close });
    };

    /** Focus moving within the popover, to the clear button, is not leaving. */
    const leaving = (event: FocusEvent) =>
        !(event.relatedTarget instanceof Node && popover.current?.contains(event.relatedTarget));
    const closeIfLeft = (event: FocusEvent) => {
        if (leaving(event)) close();
    };

    const clear = () => {
        clearRecentSearches();
        // Focus goes back to the box before the button it is on unmounts.
        input.current?.focus();
        setNotice('Recent searches cleared');
        setOpen(false);
        setActive(-1);
    };

    const status = statusOf({
        notice,
        open,
        askable,
        loading,
        error,
        // The count is of the store's suggestions, not of the shopper's own phrases above them.
        recent: recentCount,
        suggested: options.length - recentCount,
    });

    const renderOption = (option: Option, index: number) => (
        <OptionRow
            key={keyOf(option)}
            option={option}
            id={optionId(index)}
            active={index === active}
            locale={locale}
            onChoose={choose}
            onHover={() => {
                byKeys.current = false;
                setActive(index);
            }}
        />
    );
    const grouped = askable && recentCount > 0;
    const suggested = options.slice(recentCount);

    return (
        <div className="searchbox">
            <label className="searchbox-label" htmlFor={`${id}-input`}>
                Search the store
            </label>
            <input
                ref={input}
                id={`${id}-input`}
                className="searchbox-input"
                type="search"
                enterKeyHint="search"
                role="combobox"
                autoComplete="off"
                spellCheck={false}
                placeholder={placeholder ?? 'Search the store'}
                value={phrase}
                aria-autocomplete="list"
                aria-expanded={expanded}
                aria-controls={listId}
                aria-activedescendant={expanded ? activeId : undefined}
                onChange={(event) => {
                    setPhrase(event.target.value);
                    setNotice('');
                    setOpen(true);
                    setActive(-1);
                }}
                onFocus={() => {
                    setNotice('');
                    refreshRecentSearches();
                    setOpen(true);
                }}
                onBlur={closeIfLeft}
                onKeyDown={onKeyDown}
            />
            <div className="searchbox-status" role="status" aria-live="polite">
                {status}
            </div>
            <div ref={popover} className="searchbox-popover" hidden={!expanded}>
                {recentOnly && (
                    <RecentHead
                        headingId={headingId}
                        onClear={clear}
                        onBlur={closeIfLeft}
                        onEscape={() => {
                            // Focus first: focusing the box opens the popover, and the close must win.
                            input.current?.focus();
                            setOpen(false);
                        }}
                    />
                )}
                <ul id={listId} className="searchbox-list" role="listbox" {...naming}>
                    {grouped ? (
                        <>
                            <Group id={`${id}-group-recent`} title="Recent searches">
                                {options.slice(0, recentCount).map(renderOption)}
                            </Group>
                            {suggested.length > 0 && (
                                <Group id={`${id}-group-suggested`} title="Suggestions">
                                    {suggested.map((option, i) =>
                                        renderOption(option, recentCount + i)
                                    )}
                                </Group>
                            )}
                        </>
                    ) : (
                        options.map(renderOption)
                    )}
                </ul>
            </div>
        </div>
    );
};
