import { createContext, useContext } from 'react';

import { DEFAULT_LOCALE, safeLocale } from '../format/money.js';
import type { StoreQuery } from '../generated/operations.js';

/**
 * What the store says about itself that every page reads: the currency
 * amounts are in and the locale they are formatted for. Provided once by
 * the app from the store query, so no component types a symbol or
 * guesses a separator.
 */
export interface StoreInfo {
    readonly currency: string;
    readonly locale: string;
    /** Whether a member pays less than a guest for anything, so a switch between them means something. */
    readonly memberPricing: boolean;
    /** Whether some products are for members only, so a guest may not see everything. */
    readonly membersOnlyProducts: boolean;
}

/** Until the store answers: its own currency and locale, and nothing a switch would change. */
export const DEFAULT_STORE_INFO: StoreInfo = {
    currency: 'USD',
    locale: DEFAULT_LOCALE,
    memberPricing: false,
    membersOnlyProducts: false,
};

const StoreContext = createContext<StoreInfo>(DEFAULT_STORE_INFO);

export const StoreProvider = StoreContext.Provider;

export const useStoreInfo = (): StoreInfo => useContext(StoreContext);

/** What the store query says about the store, or the defaults until it has answered. */
export const storeInfoOf = (data: StoreQuery | undefined): StoreInfo =>
    data
        ? {
              currency: data.store.currency,
              locale: safeLocale(data.store.locale),
              memberPricing: data.store.memberPricing,
              membersOnlyProducts: data.store.membersOnlyProducts,
          }
        : DEFAULT_STORE_INFO;
