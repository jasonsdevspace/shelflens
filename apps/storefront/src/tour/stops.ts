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
    /** What to do and what to look for, in the page's own words. */
    readonly body: string;
    /** The page state that sets the gotcha up, for every stop the page can reach. */
    readonly to?: SearchState;
    /** What the stop points at on that page, as a selector, for "Try it" to put focus on. */
    readonly focus?: string;
    /** The tests that prove it, as paths from the repository root. */
    readonly tests: readonly string[];
}

/** What the stops point at. */
const SEARCH_BOX = 'input.searchbox-input';
const RESULTS = '.results-heading';
const BRANDS = 'fieldset[data-facet="brand"]';

/** The one product only members may see. The generator always makes it the eighth. */
const MEMBERS_ONLY_SKU = 'SL-00008';

export const STOPS: readonly Stop[] = [
    {
        id: 'stale',
        title: 'The last answer is not always the right one',
        body: 'Type "trail runner" quickly. The answer to "tra" can arrive after the answer to "trail", and a client that shows whatever came last shows the wrong list. This one gives every request a ticket and ignores a late answer.',
        to: EMPTY_STATE,
        focus: SEARCH_BOX,
        tests: [
            'apps/storefront/src/client/latest.test.ts',
            'apps/storefront/src/search/SearchBox.test.tsx',
        ],
    },
    {
        id: 'debounce',
        title: 'A burst of keystrokes is one request',
        body: 'Watch the network while you type. The suggestion list waits for a short pause after the last keystroke and sends once, so the API is not flooded and the suggestions still feel immediate.',
        to: EMPTY_STATE,
        focus: SEARCH_BOX,
        tests: ['apps/storefront/src/search/SearchBox.test.tsx'],
    },
    {
        id: 'combobox',
        title: 'The suggestion list works from the keyboard',
        body: 'Use only the keyboard. Arrow keys move the highlight, Enter chooses it, Escape closes and keeps the phrase, and a screen reader hears how many suggestions there are. An accessibility audit runs over it in the tests.',
        to: EMPTY_STATE,
        focus: SEARCH_BOX,
        tests: [
            'apps/storefront/src/search/SearchBox.test.tsx',
            'apps/storefront/e2e/start.spec.ts',
        ],
    },
    {
        id: 'recent',
        title: 'What you searched before stays with you',
        body: 'Search for something, then empty the box. What this browser searched before is offered first, under "Recent searches", filtered as you type, with "Clear" beside it. The list lives in this browser alone and never leaves it, and a search that found nothing is never offered again.',
        to: EMPTY_STATE,
        focus: SEARCH_BOX,
        tests: [
            'apps/storefront/src/search/recent.test.ts',
            'apps/storefront/src/search/SearchBox.test.tsx',
        ],
    },
    {
        id: 'cache-key',
        title: 'The cache that forgets who is asking',
        body: 'A guest is told this product does not exist. Choose "Member" under "Shopping as" at the top of the page and it appears, marked "Members only". A store that remembered answers by the search alone would hand a member\u2019s answer to the next guest, and a test shows the naive version doing exactly that.',
        to: { ...EMPTY_STATE, product: MEMBERS_ONLY_SKU },
        focus: '.product',
        tests: ['packages/api/src/cache.test.ts'],
    },
    {
        id: 'normalization',
        title: 'Café and cafe, T-shirt and tshirt, shoes and shoe',
        body: 'This search has no accent and the catalog does. Case, accents, hyphens and plurals are folded the same way when indexing and when searching, or matches silently disappear. Explain mode shows which word matched which.',
        to: { ...EMPTY_STATE, phrase: 'cafe racer', explain: true },
        focus: RESULTS,
        tests: ['packages/engine/src/normalize.test.ts', 'packages/engine/src/synonyms.test.ts'],
    },
    {
        id: 'facets',
        title: 'Ticking one brand never zeroes the others',
        body: 'Tick a brand under Filters. The other brands keep their counts, because each filter is counted as if its own choice were not there, and the brand appears as a chip under the heading. A naive count would show every other brand at zero.',
        to: { ...EMPTY_STATE, phrase: 'jacket' },
        focus: BRANDS,
        tests: ['packages/engine/src/facets.test.ts'],
    },
    {
        id: 'url',
        title: 'The address bar is the page',
        body: 'This page is a phrase, a brand and a sort, all in the URL. Copy it to share it. Untick the brand, then press back and it returns. A value the page cannot read is ignored rather than breaking it.',
        to: { ...EMPTY_STATE, phrase: 'jacket', brand: ['Ridgeback'], sort: 'price-asc' },
        focus: BRANDS,
        tests: [
            'apps/storefront/src/app/url.test.ts',
            'apps/storefront/src/app/useUrlState.test.tsx',
        ],
    },
    {
        id: 'paging',
        title: 'Paging never shows a product twice',
        body: 'Step through the pages under the results. Products with equal scores would come back in a different order on each request, so a shopper sees one twice and another never. Every sort ends on a tie breaker, and a test pages through a whole result set checking for duplicates and gaps.',
        to: { ...EMPTY_STATE, phrase: 'boot', page: 2 },
        focus: 'nav.pagination',
        tests: ['packages/engine/src/search.test.ts'],
    },
    {
        id: 'edges',
        title: 'A page past the end is empty, not an error',
        body: 'This asks for page 999. The heading still gives the real total, and the page says it is past the last page, with a link to the last one. The tests also check that a page size past the limit is reduced rather than refused.',
        to: { ...EMPTY_STATE, phrase: 'boot', page: 999 },
        focus: '.past-last',
        tests: ['packages/engine/src/search.test.ts', 'apps/storefront/src/App.results.test.tsx'],
    },
    {
        id: 'rules',
        title: 'Pins and boosts disappear under a sort',
        body: 'This search is sorted by "Price, low to high". The line over the results says the sort sets aside the pins of "Featured jackets", so the page explains itself rather than looking broken. Press "Sort by relevance" beside it and the two pinned jackets come back first.',
        to: { ...EMPTY_STATE, phrase: 'jacket', sort: 'price-asc', explain: true },
        focus: '.set-aside',
        tests: [
            'packages/engine/src/rules.test.ts',
            'apps/storefront/src/App.merchandising.test.tsx',
        ],
    },
    {
        id: 'explain',
        title: 'Why is this product first?',
        body: '"Explain ranking" is on. Under each card is its place and score, and which typed word matched which term in which field: exactly, as the start of a word, as a synonym or one typo away. Where a rule pinned, boosted or buried a product, the card says which rule did it.',
        to: { ...EMPTY_STATE, phrase: 'jackit', explain: true },
        focus: RESULTS,
        tests: [
            'packages/engine/src/search.test.ts',
            'packages/engine/src/synonyms.test.ts',
            'packages/engine/src/rules.test.ts',
            'apps/storefront/src/results/ProductCard.test.tsx',
        ],
    },
    {
        id: 'rules-editor',
        title: 'Write a rule and see it work before you save',
        body: 'Press "Add a rule" and name a jacket from the page. The results beside the panel pin it while you type. "Save rule" builds the store again under a new version, so nothing remembered from the old one is served, and "Discard your rules" brings the store\u2019s own back.',
        to: { ...EMPTY_STATE, phrase: 'jacket', explain: true, rules: true },
        focus: '.rules',
        tests: [
            'apps/storefront/src/results/RulesPanel.test.tsx',
            'apps/storefront/src/worker/handle.test.ts',
        ],
    },
    {
        id: 'popularity',
        title: 'What shoppers click rises, and never past a pin',
        body: 'Open a few of these jackets, then reload the page. The ones you opened rise a little, each with a line under the card saying "Opened from the results in 1 earlier visit", and the pinned ones stay first. The rise is capped at a quarter of the score and counts from the next visit, never mid-page, so paging holds still.',
        to: { ...EMPTY_STATE, phrase: 'jacket', explain: true },
        focus: RESULTS,
        tests: [
            'packages/engine/src/signals.test.ts',
            'packages/api/src/api.test.ts',
            'apps/storefront/src/worker/handle.test.ts',
            'apps/storefront/src/results/ProductCard.test.tsx',
        ],
    },
    {
        id: 'nothing',
        title: 'Nothing is still a page',
        body: 'No product matches every word of "zzqx jacket", so the page shows the results for "jacket" instead and says "zzqx" was left out. A word two typos off gets a spelling offered, filters that emptied the page get an offer to clear them, and when nothing helps the page shows popular products, the most clicked first.',
        to: { ...EMPTY_STATE, phrase: 'zzqx jacket' },
        focus: '.no-results-heading',
        tests: [
            'packages/engine/src/recover.test.ts',
            'packages/api/src/api.test.ts',
            'apps/storefront/src/App.results.test.tsx',
        ],
    },
    {
        id: 'prices',
        title: 'A range, in the store’s currency',
        body: 'A product sold in several sizes or colors shows its lowest and highest price, and every amount is formatted for the store’s currency and locale rather than with a symbol typed into the page. Open any jacket to see the price of each size and color.',
        to: { ...EMPTY_STATE, phrase: 'jacket', sort: 'price-desc' },
        focus: RESULTS,
        tests: [
            'apps/storefront/src/format/money.test.ts',
            'apps/storefront/src/product/variants.test.ts',
        ],
    },
    {
        id: 'cold-start',
        title: 'Related products that say where they come from',
        body: 'With nothing else viewed yet, the row of products under this one shows the most rated in its category, and its heading says "Most rated in" and the category. Open a product from that row and this one leads the next row, under a heading that begins "Viewed with this product" and says where the rest come from. It never shows the product itself or one you cannot see, and it starts over when you clear site data.',
        to: { ...EMPTY_STATE, product: 'SL-00001' },
        focus: '#rail-heading',
        tests: ['packages/api/src/recommend.test.ts', 'apps/storefront/src/App.product.test.tsx'],
    },
    {
        id: 'telemetry',
        title: 'Telemetry that cannot hurt the page',
        body: 'Search, open a product, then look in DevTools under Application, IndexedDB, shelflens-events. What you did is sent in batches with sendBeacon, so it never blocks the page. A batch delivered twice counts once, and nothing in it could name you. With Global Privacy Control on, nothing is sent at all.',
        to: EMPTY_STATE,
        focus: SEARCH_BOX,
        tests: ['apps/storefront/src/events/collector.test.ts', 'packages/api/src/events.test.ts'],
    },
    {
        id: 'errors',
        title: 'A mistake is a validation error, not a 500',
        body: 'The page cannot show this one, because it sends only the store’s own saved queries. The tests send the API a filter on an attribute it does not have and a query that nests too deep, and get a message with a code, never a stack.',
        tests: ['packages/api/src/api.test.ts', 'packages/api/src/http.test.ts'],
    },
];
