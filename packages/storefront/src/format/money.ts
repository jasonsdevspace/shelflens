/** Money as the API sends it: a whole number of minor units and a currency code. */
export interface Money {
    readonly amount: number;
    readonly currency: string;
}

/**
 * Amounts formatted for the store's currency and locale.
 *
 * The currency travels with every amount and the locale comes from the
 * store, so nothing on the page types a symbol or guesses a separator. A
 * formatter is kept per currency and locale, since making one is slow.
 */
const formatters = new Map<string, Intl.NumberFormat>();

/** A whole amount shows no fraction, and any other shows the currency's usual digits. */
const formatterFor = (currency: string, locale: string, whole: boolean): Intl.NumberFormat => {
    const key = `${locale}/${currency}/${whole ? 'whole' : 'fraction'}`;
    let formatter = formatters.get(key);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            ...(whole && { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
        });
        formatters.set(key, formatter);
    }
    return formatter;
};

export const DEFAULT_LOCALE = 'en-US';

/** A locale tag the formatter accepts, or the default when the store's cannot be read. */
export const safeLocale = (locale: string | undefined): string => {
    try {
        return Intl.getCanonicalLocales(locale ?? '')[0] ?? DEFAULT_LOCALE;
    } catch {
        return DEFAULT_LOCALE;
    }
};

/** How many minor units make one of the currency: 100 for a dollar, 1 for a yen, 1000 for a dinar. */
const minorUnitsOf = (currency: string, locale: string): number =>
    10 ** (formatterFor(currency, locale, false).resolvedOptions().maximumFractionDigits ?? 2);

export const formatMoney = ({ amount, currency }: Money, locale = DEFAULT_LOCALE): string => {
    const units = minorUnitsOf(currency, locale);
    return formatterFor(currency, locale, amount % units === 0).format(amount / units);
};

/** A single price, or the span when variants are priced differently. */
export const formatPriceRange = (min: Money, max: Money, locale = DEFAULT_LOCALE): string =>
    min.amount === max.amount
        ? formatMoney(min, locale)
        : `${formatMoney(min, locale)} to ${formatMoney(max, locale)}`;
