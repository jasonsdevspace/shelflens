/** The locale a page uses until a store names one, and on the page for a visitor's own products. */
export const DEFAULT_LOCALE = 'en-US';

/** A locale tag the formatter accepts, or the default when the store's cannot be read. */
export const safeLocale = (locale: string | undefined): string => {
    try {
        return Intl.getCanonicalLocales(locale ?? '')[0] ?? DEFAULT_LOCALE;
    } catch {
        return DEFAULT_LOCALE;
    }
};
