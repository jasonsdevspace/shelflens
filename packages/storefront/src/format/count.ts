import { DEFAULT_LOCALE } from './money.js';

const formatters = new Map<string, Intl.NumberFormat>();

/** A whole number with its digits grouped as the locale groups them: "10,000" or "10.000". */
export const formatCount = (n: number, locale = DEFAULT_LOCALE): string => {
    let formatter = formatters.get(locale);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
        formatters.set(locale, formatter);
    }
    return formatter.format(n);
};

/**
 * A number with its noun, singular for one, in the store's locale: "1
 * suggestion", "10,000 products". Each caller passes the locale the store
 * answered with, and the page for a visitor's own catalog, before any store
 * answers, takes the one every store starts with.
 */
export const count = (n: number, one: string, many: string, locale = DEFAULT_LOCALE): string =>
    `${formatCount(n, locale)} ${n === 1 ? one : many}`;
