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

export const formatMoney = ({ amount, currency }: Money, locale = DEFAULT_LOCALE): string =>
    formatterFor(currency, locale, amount % 100 === 0).format(amount / 100);

/** A single price, or the span when variants are priced differently. */
export const formatPriceRange = (min: Money, max: Money, locale = DEFAULT_LOCALE): string =>
    min.amount === max.amount
        ? formatMoney(min, locale)
        : `${formatMoney(min, locale)} to ${formatMoney(max, locale)}`;
