/** Money as the API sends it: a whole number of minor units and a currency code. */
export interface Money {
    readonly amount: number;
    readonly currency: string;
}

const formatters = new Map<string, Intl.NumberFormat>();

const formatterFor = (currency: string): Intl.NumberFormat => {
    let formatter = formatters.get(currency);
    if (!formatter) {
        formatter = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
        });
        formatters.set(currency, formatter);
    }
    return formatter;
};

export const formatMoney = ({ amount, currency }: Money): string =>
    formatterFor(currency).format(amount / 100);

/** A single price, or the span when variants are priced differently. */
export const formatPriceRange = (min: Money, max: Money): string =>
    min.amount === max.amount ? formatMoney(min) : `${formatMoney(min)} to ${formatMoney(max)}`;
