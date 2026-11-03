/** Money as the API sends it: a whole number of minor units and a currency code. */
export interface Money {
    readonly amount: number;
    readonly currency: string;
}

/** Formatters by locale, currency and whether the amount is whole, since making one is slow. */
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

/** Minor units in one of the currency: 100 for a dollar, 1 for a yen, 1000 for a dinar. */
const minorUnitsOf = (currency: string, locale: string): number =>
    10 ** (formatterFor(currency, locale, false).resolvedOptions().maximumFractionDigits ?? 2);

/**
 * An amount formatted for the store's currency and locale. The currency travels with every
 * amount and the locale comes from the store, so nothing on the page types a symbol or guesses a
 * separator.
 */
export const formatMoney = ({ amount, currency }: Money, locale: string): string => {
    const units = minorUnitsOf(currency, locale);
    return formatterFor(currency, locale, amount % units === 0).format(amount / units);
};

/** A single price, or the span when variants are priced differently. */
export const formatPriceRange = (min: Money, max: Money, locale: string): string =>
    min.amount === max.amount
        ? formatMoney(min, locale)
        : `${formatMoney(min, locale)} to ${formatMoney(max, locale)}`;

/** A price band in words, as in "Under $50", "$50 to $100" or "$100 and up", from minor units. */
export const priceBandText = (
    band: { readonly from?: number; readonly to?: number },
    currency: string,
    locale: string
): string => {
    const money = (amount: number) => formatMoney({ amount, currency }, locale);
    if (band.from === undefined && band.to !== undefined) return `Under ${money(band.to)}`;
    if (band.from !== undefined && band.to === undefined) return `${money(band.from)} and up`;
    if (band.from !== undefined && band.to !== undefined)
        return `${money(band.from)} to ${money(band.to)}`;
    return 'Any price';
};
