import { EMPTY_STATE, type SearchState } from '../app/url.js';

/**
 * The tour: the gotchas the project exists to show, each one a stop a
 * reviewer can reach in one click, with the test that proves it behind.
 *
 * The order is the order a shopper meets them: typing, looking, narrowing,
 * paging, sorting. The one gotcha the page cannot trigger says so.
 */

export interface Stop {
    readonly id: string;
    readonly title: string;
    /** What to do and what to look for, in two sentences. */
    readonly body: string;
    /** The page state that sets the gotcha up, for every stop the page can reach. */
    readonly to?: SearchState;
    /** The tests that prove it, as paths from the repository root. */
    readonly tests: readonly string[];
}

/** The one product only members may see. The generator always makes it the eighth. */
export const MEMBERS_ONLY_SKU = 'SL-00008';

export const STOPS: readonly Stop[] = [
    {
        id: 'stale',
        title: 'The last answer is not always the right one',
        body: 'Type "trail runner" quickly. The answer to "tra" can arrive after the answer to "trail", and a client that shows whatever came last shows the wrong list. This one gives every request a ticket and ignores a late answer.',
        to: EMPTY_STATE,
        tests: [
            'packages/storefront/src/client/latest.test.ts',
            'packages/storefront/src/search/SearchBox.test.tsx',
        ],
    },
    {
        id: 'debounce',
        title: 'A burst of keystrokes is one request',
        body: 'Watch the network while you type. The popover waits a short pause after the last keystroke and sends once, so the API is not flooded and the suggestions still feel immediate.',
        to: EMPTY_STATE,
        tests: ['packages/storefront/src/search/SearchBox.test.tsx'],
    },
    {
        id: 'combobox',
        title: 'The popover is a combobox',
        body: 'Use only the keyboard. Arrow keys move the highlight, Enter searches it, Escape closes and keeps the phrase, and a screen reader hears how many suggestions there are. An accessibility audit runs over it in the tests.',
        to: EMPTY_STATE,
        tests: [
            'packages/storefront/src/search/SearchBox.test.tsx',
            'packages/storefront/e2e/storefront.spec.ts',
        ],
    },
    {
        id: 'cache-key',
        title: 'A cache key that forgets who is asking',
        body: 'This product does not exist for a guest. Switch to member in the masthead and it appears, and every price drops. A cache keyed on the query alone would serve that member answer to the next guest, and a test proves it does.',
        to: { ...EMPTY_STATE, product: MEMBERS_ONLY_SKU },
        tests: ['packages/api/src/cache.test.ts'],
    },
    {
        id: 'normalization',
        title: 'Café and cafe, T-shirt and tshirt, shoes and shoe',
        body: 'This search has no accent and the catalog does. Case, accents, hyphens and plurals are folded the same way when indexing and when searching, or matches silently disappear. Explain mode shows which word matched which.',
        to: { ...EMPTY_STATE, phrase: 'cafe racer', explain: true },
        tests: ['packages/engine/src/normalize.test.ts', 'packages/engine/src/synonyms.test.ts'],
    },
    {
        id: 'facets',
        title: 'Choosing Red never zeroes Blue',
        body: 'Tick a brand. The other brands keep their counts, because a facet counts past its own filter. A naive count would leave one choice in each facet after the first click.',
        to: { ...EMPTY_STATE, phrase: 'jacket' },
        tests: ['packages/engine/src/facets.test.ts'],
    },
    {
        id: 'url',
        title: 'The address bar is the page',
        body: 'This page is a phrase, a brand, a sort and a page number, all in the URL. Copy it to share it, press back to undo the brand. A value the page cannot read is ignored rather than breaking it.',
        to: { ...EMPTY_STATE, phrase: 'jacket', brand: ['Ridgeback'], sort: 'price-asc' },
        tests: ['packages/storefront/src/app/url.test.ts'],
    },
    {
        id: 'paging',
        title: 'Paging never shows a product twice',
        body: 'Products with equal scores would come back in a different order on each request, so a shopper sees one twice and another never. Every sort ends on a tie breaker, and a test pages through a whole result set checking for duplicates and gaps.',
        to: { ...EMPTY_STATE, phrase: 'boot', page: 2 },
        tests: ['packages/engine/src/search.test.ts'],
    },
    {
        id: 'edges',
        title: 'A page past the end is empty, not an error',
        body: 'This asks for page 999. The answer is an empty page with the real total, and a page size past the limit is reduced rather than refused. Pinned products beyond the page size still come first.',
        to: { ...EMPTY_STATE, phrase: 'boot', page: 999 },
        tests: ['packages/engine/src/search.test.ts', 'packages/engine/src/rules.test.ts'],
    },
    {
        id: 'rules',
        title: 'Pins and boosts disappear under a sort',
        body: 'Under relevance, two jackets are pinned first by a rule. Sorted by price, the pin is set aside and the page says so rather than looking broken. Switch the sort back and watch them return.',
        to: { ...EMPTY_STATE, phrase: 'jacket', sort: 'price-asc', explain: true },
        tests: ['packages/engine/src/rules.test.ts', 'packages/storefront/src/App.test.tsx'],
    },
    {
        id: 'explain',
        title: 'Why is this product first?',
        body: 'Explain mode is on. Under each card is which typed word matched which indexed term in which field, exactly, by prefix, by synonym or corrected, and which rule pinned, boosted or buried it. The tool a merchandiser needs, and the engine carries it on every hit.',
        to: { ...EMPTY_STATE, phrase: 'jackit', explain: true },
        tests: ['packages/api/src/api.test.ts', 'packages/engine/src/search.test.ts'],
    },
    {
        id: 'nothing',
        title: 'Nothing is still a page',
        body: 'One word here matches nothing. The page shows the results of the phrase without it, offers a spelling when a word is two typos off, offers to clear filters that emptied the page, and falls back to the most rated products.',
        to: { ...EMPTY_STATE, phrase: 'zzqx jacket' },
        tests: ['packages/engine/src/recover.test.ts', 'packages/storefront/src/App.test.tsx'],
    },
    {
        id: 'prices',
        title: 'A range, in the store’s currency',
        body: 'A product with variants shows the least and the most it costs, and every amount is formatted for the store’s currency and locale rather than with a symbol typed into the page. Open the product for the table of variants.',
        to: { ...EMPTY_STATE, phrase: 'jacket', sort: 'price-desc' },
        tests: ['packages/storefront/src/format/money.test.ts'],
    },
    {
        id: 'errors',
        title: 'A mistake is a validation error, not a 500',
        body: 'The one stop the page cannot reach. The demo accepts only its own operations, so nothing a browser sends can be malformed. The tests send the API a filter on an attribute it does not have and a query that nests too deep, and get a message with a code, never a stack.',
        tests: ['packages/api/src/api.test.ts', 'packages/api/src/http.test.ts'],
    },
];
