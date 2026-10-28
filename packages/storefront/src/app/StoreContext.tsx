import { createContext, useContext } from 'react';

import { DEFAULT_LOCALE } from '../format/money.js';

/**
 * What the store says about itself that every page reads: the currency
 * amounts are in and the locale they are formatted for. Provided once by
 * the app from the store query, so no component types a symbol or
 * guesses a separator.
 */
export interface StoreInfo {
    readonly currency: string;
    readonly locale: string;
}

export const DEFAULT_STORE_INFO: StoreInfo = { currency: 'USD', locale: DEFAULT_LOCALE };

const StoreContext = createContext<StoreInfo>(DEFAULT_STORE_INFO);

export const StoreProvider = StoreContext.Provider;

export const useStoreInfo = (): StoreInfo => useContext(StoreContext);
