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

/**
 * A price as whole cents, or undefined when it is not one.
 *
 * Either mark can be the decimal one, so "1,299.00", "1.299,00", "12,5" and
 * "$12" all read. A mark followed by exactly three digits with no other mark
 * is taken as thousands, which is how "1,299" is usually meant.
 */
export const parseMoney = (value: string): number | undefined => {
    const digits = value.replace(/[^\d.,-]/g, '');
    if (!/\d/.test(digits) || digits.startsWith('-')) return undefined;
    const lastDot = digits.lastIndexOf('.');
    const lastComma = digits.lastIndexOf(',');
    const decimalAt = Math.max(lastDot, lastComma);
    const fraction = decimalAt === -1 ? '' : digits.slice(decimalAt + 1);
    const thousandsOnly = (lastDot === -1 || lastComma === -1) && fraction.length === 3;
    const whole = thousandsOnly || decimalAt === -1 ? digits : digits.slice(0, decimalAt);
    const units = Number(whole.replace(/[.,]/g, ''));
    const cents =
        thousandsOnly || decimalAt === -1 ? 0 : Number(fraction.padEnd(2, '0').slice(0, 2));
    if (!Number.isFinite(units) || (fraction.length > 2 && !thousandsOnly)) return undefined;
    return units * 100 + cents;
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
