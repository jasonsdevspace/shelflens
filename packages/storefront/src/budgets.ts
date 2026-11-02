/*
 * The page's download budget.
 *
 * The popover is the first thing a shopper waits for, so the page that
 * carries it has a size budget the build enforces. React is most of it.
 * Measured at 72 KB compressed when the budget was set, and the page must
 * hold nothing from GraphQL: the operations are generated as strings so
 * no parser or printer is needed in the browser.
 */
export const BUDGET_BYTES = 100 * 1024;

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
