/**
 * Reading the values in a visitor's cells.
 *
 * A spreadsheet writes money, yes and no, and lists in many ways, and each
 * reader here takes the common ones and says when it cannot read a value,
 * rather than guessing a number that would end up on a price.
 */

const SYMBOLS: Readonly<Record<string, string>> = { $: 'USD', '€': 'EUR', '£': 'GBP' };
const CODES = new Set(['USD', 'EUR', 'GBP']);

/** The currency a price names, by its symbol or its code, if it names one this store can show. */
export const currencyOf = (value: string): string | undefined => {
    for (const [symbol, code] of Object.entries(SYMBOLS)) {
        if (value.includes(symbol)) return code;
    }
    const code = /\b([A-Z]{3})\b/.exec(value)?.[1];
    return code && CODES.has(code) ? code : undefined;
};

/** The marks a number can use for its decimals. */
export type DecimalMark = '.' | ',';

/**
 * Which mark a column of prices uses for its decimals.
 *
 * One cell alone cannot say: "1,299" is a thousand and more in one country
 * and one and a bit in another. A column can, since some of its prices end
 * in a mark and one or two digits, and that mark is the decimal one. A cell
 * with both marks says so too, by which comes last. A column that never
 * says is read with a point, as most exports write.
 */
export const decimalMarkOf = (cells: readonly string[]): DecimalMark => {
    let points = 0;
    let commas = 0;
    for (const cell of cells) {
        const digits = cell.replace(/[^\d.,]/g, '');
        const last = /[.,](?=\d{1,2}$)/.exec(digits)?.[0];
        const both = digits.includes('.') && digits.includes(',');
        const mark =
            last ??
            (both
                ? digits.at(Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(',')))
                : undefined);
        if (mark === '.') points += 1;
        if (mark === ',') commas += 1;
    }
    return commas > points ? ',' : '.';
};

/** A price with nothing but a currency symbol or code beside the number. */
const PRICE = /^(?:[A-Z]{3}\s*)?[$€£]?\s*(\d[\d.,\s]*)\s*(?:[$€£]|[A-Z]{3})?$/;

/**
 * A price as whole cents, or undefined when it is not one.
 *
 * Only a number with an optional currency symbol or code reads, so "2 for
 * $10" or "call for price" is refused rather than turned into digits. The
 * column's decimal mark says which mark ends the whole part. The other mark
 * may group thousands, and more than two decimals is refused, since a
 * price has cents and nothing finer.
 */
export const parseMoney = (value: string, decimal: DecimalMark = '.'): number | undefined => {
    const number = PRICE.exec(value.trim())?.[1]?.replace(/\s/g, '');
    if (!number) return undefined;
    const grouping = decimal === '.' ? ',' : '.';
    const [whole = '', fraction = '', extra] = number.split(decimal);
    if (extra !== undefined || fraction.length > 2 || !/^\d*$/.test(fraction)) return undefined;
    const grouped = new RegExp(`^\\d{1,3}(?:\\${grouping}\\d{3})*$`);
    if (!/^\d+$/.test(whole) && !grouped.test(whole)) return undefined;
    const units = Number(whole.split(grouping).join(''));
    return units * 100 + Number(fraction.padEnd(2, '0'));
};

const YES = new Set(['yes', 'y', 'true', '1', 'in stock', 'available', 'instock']);
const NO = new Set([
    'no',
    'n',
    'false',
    '0',
    'out of stock',
    'unavailable',
    'sold out',
    'outofstock',
]);

/** Whether a cell says yes, no, or neither. A count of units reads as yes when above zero. */
export const parseYesNo = (value: string): boolean | undefined => {
    const text = value.trim().toLowerCase();
    if (YES.has(text)) return true;
    if (NO.has(text)) return false;
    const count = Number(text);
    return Number.isFinite(count) && text !== '' ? count > 0 : undefined;
};

/** A rating out of five, to one place, or undefined when it is not one. */
export const parseRating = (value: string): number | undefined => {
    const number = Number(value.replace(',', '.').replace(/\s*\/\s*5$/, ''));
    if (value.trim() === '' || !Number.isFinite(number) || number < 0 || number > 5)
        return undefined;
    return Math.round(number * 10) / 10;
};

/** A whole count, or undefined. */
export const parseCount = (value: string): number | undefined => {
    const number = Number(value.replace(/[,\s]/g, ''));
    return value.trim() !== '' && Number.isInteger(number) && number >= 0 ? number : undefined;
};

/** A cell holding several values, separated by commas, pipes or semicolons. */
export const splitList = (value: string): string[] =>
    value
        .split(/[,|;]/)
        .map((item) => item.trim())
        .filter((item) => item !== '');

/** A category cell as its path from the top, split on ">" or "/". */
export const splitPath = (value: string): string[] =>
    value
        .split(/[>/]/)
        .map((item) => item.trim())
        .filter((item) => item !== '');
