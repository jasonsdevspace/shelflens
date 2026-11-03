/** The locale a page uses where no store has named one, such as the page for a visitor's own products. */
export const DEFAULT_LOCALE = 'en-US';

/** A locale tag the formatter accepts, or the default when the store's cannot be read. */
export const safeLocale = (locale: string | undefined): string => {
    try {
        return Intl.getCanonicalLocales(locale ?? '')[0] ?? DEFAULT_LOCALE;
    } catch {
        return DEFAULT_LOCALE;
    }
};
