/**
 * The page's download budget.
 *
 * The popover is the first thing a shopper waits for, so the page that
 * carries it has a size budget the build enforces. React is most of it.
 * Measured at 72 KB compressed when the budget was set, and the page must
 * hold nothing from GraphQL: the operations are generated as names, the
 * hash of each one's text, so no parser, printer or query text is needed in
 * the browser. Raised from 100 KB to 104 KB for the visit counter, which adds
 * about 2 KB, when the bundle test measured the page at 99 KB without it.
 */
export const BUDGET_BYTES = 104 * 1024;

/**
 * The widget's budget. It carries the box, the client and a React of its
 * own, and React is nine tenths of it. Measured at 76 KB compressed when
 * the budget was set, by this build and by the shipped file alike.
 */
export const WIDGET_BUDGET_BYTES = 85 * 1024;

/**
 * The page for a visitor's own catalog: the store's page, with the file
 * readers, the guessed mapping and the converter beside it, which no other
 * page loads. Measured at 99 KB compressed when the budget was set.
 */
export const TRY_BUDGET_BYTES = 115 * 1024;

/**
 * The service worker, which a visit downloads once and keeps. It carries
 * the engine, the API with its schema and its persisted operations, and
 * GraphQL itself, which is the most of it and the reason the pages carry
 * none. Measured at 74 KB compressed when the budget was set.
 */
export const WORKER_BUDGET_BYTES = 85 * 1024;

/**
 * The demo's catalog, which the store's first visit downloads and indexes in
 * the browser. Measured at 332 KB compressed when the budget was set.
 */
export const CATALOG_BUDGET_BYTES = 400 * 1024;

/**
 * A sentence only the golden queries hold, which the tests read and nothing
 * shipped should. The budget check and the bundle test refuse any file with
 * it, and a test holds it to the golden queries' own text, so rewording them
 * cannot leave the check looking for nothing.
 */
export const FIXTURE_PROBE = 'a two-word product name outranks products matching one word';
