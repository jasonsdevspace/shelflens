const formatters = new Map<string, Intl.NumberFormat>();

/** A whole number with its digits grouped as the locale groups them: "10,000" or "10.000". */
export const formatCount = (n: number, locale: string): string => {
    let formatter = formatters.get(locale);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
        formatters.set(locale, formatter);
    }
    return formatter.format(n);
};

/**
 * A number with its noun, singular for one, in the store's locale: "1
 * suggestion", "10,000 products". The locale is always given, so a count
 * can never fall back to one the store did not answer with: each component
 * passes the store's, and the page for a visitor's own catalog, before any
 * store answers, passes the one every store starts with.
 */
export const count = (n: number, one: string, many: string, locale: string): string =>
    `${formatCount(n, locale)} ${n === 1 ? one : many}`;
