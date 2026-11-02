/**
 * The events a storefront collects, and where they land.
 *
 * Three kinds: a search, a click on a result, and a view of a product, each
 * carrying the tab it happened in as a random id that dies with the tab.
 * Each is a closed set of fields, and a batch with anything else in it is
 * refused whole, so nothing a page did not mean to send can arrive by
 * accident. A phrase is folded to lower case, collapsed and capped, so a
 * name typed into the search box arrives as a few words and never as a
 * record. Every event carries an id the page made, and a store keeps each
 * id once, so a batch delivered twice, which a beacon the page cannot
 * confirm will do, counts once.
 *
 * Events arrive on a `POST` to `events` beside `graphql`, not as a
 * mutation. A beacon cannot set the viewer header, the public demo refuses
 * every `POST` to the API, and a mutation would need a hole in that rule
 * for no gain. A batch that carries Global Privacy Control is answered and
 * dropped, so the browser's signal is honored at the receiver as well as
 * in the page.
 */

export type EventKind = 'search' | 'click' | 'view';

export interface StoreEvent {
    /** Made by the page, so a repeated delivery is the same event. */
    readonly id: string;
    readonly kind: EventKind;
    /** When it happened, in milliseconds since the epoch. */
    readonly at: number;
    /** The phrase searched, or the phrase a clicked result was found under. */
    readonly phrase?: string;
    /** The product clicked or viewed. */
    readonly sku?: string;
    /** Where on the page a clicked result stood, from one. */
    readonly position?: number;
    /**
     * The tab the event happened in, as a random id the page made and keeps
     * until the tab closes. What was viewed together is read from it.
     */
    readonly session?: string;
}

/** Where a host keeps events. Each id is kept once however often it arrives. */
export interface EventStore {
    append(events: readonly StoreEvent[]): Promise<void>;
    /** Every kept event, oldest first. */
    all(): Promise<readonly StoreEvent[]>;
}

/** The header a browser sends when the visitor asked not to be tracked. */
export const GPC_HEADER = 'sec-gpc';

/** How many events a store keeps before the oldest go. */
export const EVENT_LIMIT = 10_000;

/** How many events one batch may carry. */
export const BATCH_LIMIT = 100;

const ID_LIMIT = 64;
const SKU_LIMIT = 32;
const PHRASE_LIMIT = 80;
const KINDS: ReadonlySet<string> = new Set<EventKind>(['search', 'click', 'view']);
const SESSION_LIMIT = 64;
const FIELDS: ReadonlySet<string> = new Set([
    'id',
    'kind',
    'at',
    'phrase',
    'sku',
    'position',
    'session',
]);

/** A phrase as the store keeps it: lower case, one space between words, capped. */
export const foldPhrase = (phrase: string): string =>
    phrase.toLowerCase().trim().split(/\s+/).join(' ').slice(0, PHRASE_LIMIT);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, limit: number): string | undefined =>
    typeof value === 'string' && value.length > 0 && value.length <= limit ? value : undefined;

type Mutable = { -readonly [Key in keyof StoreEvent]: StoreEvent[Key] };

/** The required fields, or nothing when one is missing or wrong. */
const parseRequired = (value: Record<string, unknown>): Mutable | undefined => {
    const id = text(value.id, ID_LIMIT);
    const { kind, at } = value;
    if (id === undefined || typeof kind !== 'string' || !KINDS.has(kind)) return undefined;
    if (typeof at !== 'number' || !Number.isFinite(at)) return undefined;
    return { id, kind: kind as EventKind, at };
};

/** Adds the optional fields that are present. False when one is present and wrong. */
const parseOptional = (value: Record<string, unknown>, event: Mutable): boolean => {
    const { phrase, sku, position, session } = value;
    if (phrase !== undefined) {
        if (typeof phrase !== 'string') return false;
        const folded = foldPhrase(phrase);
        if (folded.length > 0) event.phrase = folded;
    }
    if (sku !== undefined) {
        const skuText = text(sku, SKU_LIMIT);
        if (skuText === undefined) return false;
        event.sku = skuText;
    }
    if (position !== undefined) {
        if (!Number.isInteger(position) || (position as number) < 1) return false;
        event.position = position as number;
    }
    if (session !== undefined) {
        const sessionText = text(session, SESSION_LIMIT);
        if (sessionText === undefined) return false;
        event.session = sessionText;
    }
    return true;
};

const parseEvent = (value: unknown): StoreEvent | undefined => {
    if (!isRecord(value)) return undefined;
    if (Object.keys(value).some((key) => !FIELDS.has(key))) return undefined;
    const event = parseRequired(value);
    return event && parseOptional(value, event) ? event : undefined;
};

/**
 * A batch as the page sends it, or nothing when any part of it is not an
 * event. The whole batch is refused rather than the one event, so a page
 * that sends something new finds out.
 */
export const parseEventBatch = (value: unknown): readonly StoreEvent[] | undefined => {
    if (!Array.isArray(value) || value.length > BATCH_LIMIT) return undefined;
    const events: StoreEvent[] = [];
    for (const item of value) {
        const event = parseEvent(item);
        if (!event) return undefined;
        events.push(event);
    }
    return events;
};

export interface MemoryEventStoreOptions {
    readonly limit?: number;
}

/**
 * Events kept in memory, for tests and for the Node server. Oldest first
 * by the event's own time, which is what the worker's store does too, so
 * the two hosts keep the same events past the limit.
 */
export const createMemoryEventStore = ({
    limit = EVENT_LIMIT,
}: MemoryEventStoreOptions = {}): EventStore => {
    let events: StoreEvent[] = [];
    const ids = new Set<string>();
    return {
        append: (batch) => {
            for (const event of batch) {
                if (ids.has(event.id)) continue;
                ids.add(event.id);
                events.push(event);
            }
            // By time, then by id as IndexedDB orders equal times, so both hosts keep the same.
            events.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
            if (events.length > limit) {
                for (const gone of events.slice(0, events.length - limit)) ids.delete(gone.id);
                events = events.slice(events.length - limit);
            }
            return Promise.resolve();
        },
        all: () => Promise.resolve(events.slice()),
    };
};

/** Whether a URL is for the events receiver: `events` under the host's base. */
export const isEventsPath = (url: string, base = '/'): boolean =>
    new URL(url, 'http://local').pathname === `${base}events`;

/** Which of the host's paths a URL names, parsing it once, or nothing. */
export const routeOf = (url: string, base = '/'): 'graphql' | 'events' | 'rules' | undefined => {
    const { pathname } = new URL(url, 'http://local');
    if (pathname === `${base}graphql`) return 'graphql';
    if (pathname === `${base}events`) return 'events';
    if (pathname === `${base}rules`) return 'rules';
    return undefined;
};

export interface EventsRequest {
    readonly method: string;
    readonly body?: string | undefined;
    header(name: string): string | null | undefined;
}

export interface Receipt {
    readonly status: number;
    readonly message?: string;
}

/**
 * What the receiver answers, shared by every host. A batch is kept, or
 * refused with a reason, or dropped without a word when the browser said
 * not to track.
 */
export const receiveEvents = async (
    request: EventsRequest,
    store: EventStore,
    now: () => number = Date.now
): Promise<Receipt> => {
    if (request.method !== 'POST') return { status: 405, message: 'events are posted' };
    if (request.header(GPC_HEADER) === '1') return { status: 204 };
    let parsed: unknown;
    try {
        parsed = JSON.parse(request.body ?? '');
    } catch {
        return { status: 400, message: 'the batch is not JSON' };
    }
    const batch = parseEventBatch(parsed);
    if (!batch) return { status: 400, message: 'the batch is not a list of events' };
    // A page's clock decides what the store keeps past its limit, so a time
    // ahead of the receiver's own is brought back to it.
    const received = now();
    await store.append(
        batch.map((event) => (event.at > received ? { ...event, at: received } : event))
    );
    return { status: 204 };
};
