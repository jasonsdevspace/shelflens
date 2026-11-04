import { reasonOf } from '../client/reason.js';
import { count } from '../format/count.js';
import { DEFAULT_LOCALE } from '../format/locale.js';
import { SAMPLE_PRODUCTS } from './sample.js';

/** The button that loads the sample, named again by a message that offers it and by the explainer. */
export const SAMPLE_BUTTON = `Try it with a sample of ${count(SAMPLE_PRODUCTS, 'product', 'products', DEFAULT_LOCALE)}`;

/**
 * The button back to the products already loaded. It names no count, since
 * another tab may have changed them since, and the button opens whatever is
 * there.
 */
export const BACK_LABEL = 'Back to your products';

/** Said when the way back finds the products gone, as after a removal in another tab. */
export const GONE =
    'Your products are no longer in this browser, so there is nothing to go back to.';

/** The button that searches a whole file, named again by the messages that point to it. */
export const searchLabel = (products: number) =>
    `Search ${count(products, 'product', 'products', DEFAULT_LOCALE)}`;

/**
 * A reason as the end of a sentence: no closing period, and a capital that
 * only starts a sentence made small, so a browser's own message reads after
 * "since" as well as the engine's does.
 */
const asClause = (reason: string): string => {
    const trimmed = reason.trim().replace(/\.$/, '');
    return /^[A-Z][a-z]/.test(trimmed)
        ? `${trimmed[0]?.toLowerCase() ?? ''}${trimmed.slice(1)}`
        : trimmed;
};

/** Why a load failed, in the worker's words when it gave some, with the way to try again. */
export const errorOf = async (response: Response, retry: string): Promise<string> => {
    const again = `Press \u201c${retry}\u201d to try again.`;
    const reason = await reasonOf(response);
    return reason
        ? `The store could not use these products, since ${asClause(reason)}. ${again}`
        : `The store could not load these products (error ${response.status}). ${again}`;
};
