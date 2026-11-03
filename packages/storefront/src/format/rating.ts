import { count } from './count.js';

const averages = new Map<string, Intl.NumberFormat>();

/** An average rating to one place, as the locale writes a decimal, as in "4.4", or "4,4" in German. */
export const formatAverage = (average: number, locale: string): string => {
    let formatter = averages.get(locale);
    if (!formatter) {
        formatter = new Intl.NumberFormat(locale, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
        });
        averages.set(locale, formatter);
    }
    return formatter.format(average);
};

/** A rating as every page says it, as in "4.4 out of 5, from 587 ratings". */
export const ratingText = (average: number, ratings: number, locale: string): string =>
    `${formatAverage(average, locale)} out of 5, from ${count(ratings, 'rating', 'ratings', locale)}`;
