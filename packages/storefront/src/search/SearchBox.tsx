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
    asked: boolean,
    suggestions: Suggestions | undefined
): readonly Option[] => {
    // Capped from the moment the store is asked, so the list holds still through the wait.
    const shown = asked ? recent.slice(0, RECENT_BESIDE_SUGGESTIONS) : recent;
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

/**
 * What the popover lists for the phrase: the matching recent phrases, then the
 * store's suggestions. The store is in play only once it has answered this
 * phrase with something: one test, so the cap on recent phrases, the grouping
 * and the list's name never disagree.
 */
const usePopover = (
    recent: readonly string[],
    phrase: string,
    answered: { readonly phrase: string; readonly suggestions: Suggestions } | undefined
) => {
    const current = answered?.phrase === phrase.trim() ? answered.suggestions : undefined;
    const suggestions =
        current && current.queries.length + current.products.length > 0 ? current : undefined;
    const asked = isAskable(phrase);
    const matching = useMemo(() => matchingRecent(recent, phrase), [recent, phrase]);
    const options = useMemo(
        () => optionsOf(matching, asked, suggestions),
        [matching, asked, suggestions]
    );
    const recentCount = options.filter((option) => option.kind === 'recent').length;
    return { options, recentCount, storeHas: suggestions !== undefined };
};

/** The highlight is an index into the list, so it starts over when the list is another. */
const useHighlight = (options: readonly Option[]) => {
    const [active, setActive] = useState(-1);
    const keys = options.map(keyOf).join('\n');
    const [listed, setListed] = useState(keys);
    if (listed !== keys) {
        setListed(keys);
        setActive(-1);
    }
    return [active, setActive] as const;
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
const useScrolledIntoView = (
    elementId: string | undefined,
    byKeys: RefObject<boolean>,
    input: RefObject<HTMLInputElement | null>
) => {
    useEffect(() => {
        if (!elementId || !byKeys.current) return;
        // The option is in the same tree as the box, which may be a shadow root rather
        // than the document, and both know their elements by id.
        const tree = input.current?.getRootNode();
        if (tree instanceof Document || tree instanceof ShadowRoot) {
            tree.getElementById(elementId)?.scrollIntoView({ block: 'nearest' });
        }
    }, [elementId, byKeys, input]);
};

/** Whether this browser has a top layer for popovers. A test document does not, and shows the list in place. */
const TOP_LAYER = typeof HTMLElement !== 'undefined' && 'togglePopover' in HTMLElement.prototype;

/** How far below the box the popover sits, and how close to the viewport's edge it may reach. */
const GAP_PX = 4;
const EDGE_PX = 12;

/** How little room under the box is too little, so the list opens above it instead. */
const ROOM_PX = 160;

/**
 * Places the list under the box, from the box's rectangle, within the viewport.
 * With too little room under the box and more above it, the list opens above,
 * and it never reaches past the viewport's edge, so every option can be seen.
 */
const placeUnder = (box: HTMLElement, field: HTMLElement) => {
    const rect = field.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP_PX - EDGE_PX;
    const above = rect.top - GAP_PX - EDGE_PX;
    const flipped = below < ROOM_PX && above > below;
    // The viewport's width without a scrollbar, so the list never sits under one.
    const viewport = document.documentElement.clientWidth;
    const width = Math.min(rect.width, viewport - 2 * EDGE_PX);
    const left = Math.min(Math.max(EDGE_PX, rect.left), viewport - EDGE_PX - width);
    box.style.setProperty('left', `${left}px`);
    box.style.setProperty('width', `${width}px`);
    box.style.setProperty('top', flipped ? 'auto' : `${rect.bottom + GAP_PX}px`);
    box.style.setProperty(
        'bottom',
        flipped ? `${window.innerHeight - rect.top + GAP_PX}px` : 'auto'
    );
    box.style.setProperty('max-height', `${Math.max(0, flipped ? above : below)}px`);
};

/**
 * Puts the popover in the browser's top layer while it is open, over
 * anything a page stacks or clips, and places it under the box from the
 * box's own rectangle, following a scroll or a resize. A popover in the
 * top layer is the same element in the same tree, so every id the box
 * refers to still resolves, and focus moving onto its button is still
 * focus within it.
 */
const usePlacedPopover = (
    expanded: boolean,
    input: RefObject<HTMLInputElement | null>,
    popover: RefObject<HTMLDivElement | null>
) => {
    useEffect(() => {
        const box = popover.current;
        const field = input.current;
        if (!box || !field || !TOP_LAYER) return;
        if (!expanded) {
            box.togglePopover(false);
            return;
        }
        const place = () => placeUnder(box, field);
        // The list's own scrolling is the one scroll that cannot move the box.
        const scrolled = (event: Event) => {
            if (!(event.target instanceof Node && box.contains(event.target))) place();
        };
        place();
        box.togglePopover(true);
        // The box moves with a scroll, a resize, and any layout the page or the host
        // shifts under it, such as an image or a font landing late.
        window.addEventListener('scroll', scrolled, true);
        window.addEventListener('resize', place);
        const watched = new ResizeObserver(place);
        watched.observe(field);
        watched.observe(document.body);
        return () => {
            window.removeEventListener('scroll', scrolled, true);
            window.removeEventListener('resize', place);
            watched.disconnect();
        };
    }, [expanded, input, popover]);
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
    const recents = count(recent, 'recent search', 'recent searches');
    if (suggested > 0 && recent > 0) {
        return `${recents} and ${count(suggested, 'suggestion', 'suggestions')}`;
    }
    if (suggested > 0) return count(suggested, 'suggestion', 'suggestions');
    return recent > 0 ? recents : '0 suggestions';
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

/** A group within the list, named by an element of its own or by one already on the page. */
const Group = ({
    labelledBy,
    title,
    children,
}: {
    readonly labelledBy: string;
    readonly title?: string;
    readonly children: ReactNode;
}) => (
    <li role="group" aria-labelledby={labelledBy}>
        {title !== undefined && (
            <div id={labelledBy} role="presentation" className="searchbox-group-title">
                {title}
            </div>
        )}
        <ul role="presentation" className="searchbox-group">
            {children}
        </ul>
    </li>
);

/** The heading the eye and the screen reader share for the shopper's own phrases, and the way to clear them. */
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
    // Said once after the recent searches are cleared, ahead of the usual count.
    const [notice, setNotice] = useState('');
    const { answered, loading, error } = useSuggestions(client, phrase);
    const recent = useRecentSearches();
    const askable = isAskable(phrase);
    const { options, recentCount, storeHas } = usePopover(recent, phrase, answered);
    const [active, setActive] = useHighlight(options);
    const expanded = open && (options.length > 0 || (askable && loading));
    const listId = `${id}-listbox`;
    const headingId = `${id}-recent`;
    const optionId = (index: number) => `${id}-option-${index}`;
    const activeId = active >= 0 ? optionId(active) : undefined;
    const byKeys = useRef(false);
    useScrolledIntoView(activeId, byKeys, input);
    usePlacedPopover(expanded, input, popover);
    // The list is named by the visible heading while it is the shopper's own history.
    const naming =
        recentCount > 0 && !storeHas
            ? { 'aria-labelledby': headingId }
            : { 'aria-label': 'Suggestions' };

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
        const cleared = clearRecentSearches();
        // Focus goes back to the box before the button it is on unmounts.
        input.current?.focus();
        setNotice(
            cleared ? 'Recent searches cleared' : 'The recent searches could not be cleared.'
        );
        setOpen(false);
        setActive(-1);
    };

    const status = statusOf({
        notice,
        open,
        askable,
        loading,
        error,
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
    // Beside the store's suggestions the shopper's own phrases are a group of their own,
    // named by the heading above them, so a screen reader hears where they end.
    const grouped = storeHas && recentCount > 0;

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
            <div
                ref={popover}
                className="searchbox-popover"
                popover={TOP_LAYER ? 'manual' : undefined}
                hidden={!expanded}
            >
                {recentCount > 0 && (
                    <RecentHead
                        headingId={headingId}
                        onClear={clear}
                        onBlur={closeIfLeft}
                        onEscape={() => {
                            // Focus first: focusing the box opens the popover, and the close must win.
                            input.current?.focus();
                            close();
                        }}
                    />
                )}
                <ul id={listId} className="searchbox-list" role="listbox" {...naming}>
                    {grouped ? (
                        <>
                            <Group labelledBy={headingId}>
                                {options.slice(0, recentCount).map(renderOption)}
                            </Group>
                            <Group labelledBy={`${id}-group-suggested`} title="Suggestions">
                                {options
                                    .slice(recentCount)
                                    .map((option, i) => renderOption(option, recentCount + i))}
                            </Group>
                        </>
                    ) : (
                        options.map(renderOption)
                    )}
                </ul>
            </div>
        </div>
    );
};
