import { createContext, useContext } from 'react';

import type { Recorded } from './collector.js';

/**
 * How a page records what the shopper did. The app provides the
 * collector's `record`, and anything rendered outside one records into
 * the void, so a component never has to ask whether events are on.
 */

export type Record = (event: Recorded) => void;

const EventsContext = createContext<Record>(() => undefined);

export const EventsProvider = EventsContext.Provider;

export const useRecord = (): Record => useContext(EventsContext);
