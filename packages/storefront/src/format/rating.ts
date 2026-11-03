import { count } from './count.js';

/** A rating as every page says it, as in "4.4 out of 5, from 587 ratings". */
export const ratingText = (average: number, ratings: number, locale: string): string =>
    `${average.toFixed(1)} out of 5, from ${count(ratings, 'rating', 'ratings', locale)}`;
