import { BATCH_LIMIT, type EventKind, type StoreEvent } from '@shelflens/api';

/**
 * Collects what the shopper does and sends it in batches, without ever
 * getting in the page's way.
 *
 * Recording an event is a push onto a queue. The queue is sent after a
 * short pause, and when the page is hidden or left, with `sendBeacon`, so
 * no request is ever awaited and a page being closed still delivers. A
 * beacon says only whether the browser took it, so a batch the browser
 * refused stays queued for the next try, and the store keeps each id
 * once in case a batch was taken and delivered twice. Nothing is sent
 * until the host says the API can answer, which on a first visit is when
 * the worker claims the page. When the browser sends Global Privacy
 * Control nothing is queued at all, so there is nothing to send. When
 * `sendBeacon` is missing, everything queued stays queued, bounded, and
 * the page is none the worse.
 */

/** What the page records. The id and the time are added here. */
export interface Recorded {
    readonly kind: EventKind;
    readonly phrase?: string | undefined;
    readonly sku?: string | undefined;
    readonly position?: number | undefined;
}

export interface Collector {
    readonly record: (event: Recorded) => void;
    /** Send what is queued now, if the host is ready and the browser takes it. */
    readonly flush: () => void;
    readonly dispose: () => void;
}

export interface CollectorOptions {
    /** Where batches go. */
    readonly url: string;
    /** Resolves once the host can receive. Nothing is sent before. */
    readonly ready?: Promise<void>;
    /** Whether the visitor allows collection. Off under Global Privacy Control. */
    readonly allowed?: boolean;
    /** Hands a batch to the browser. True when the browser took it. */
    readonly send?: (url: string, body: string) => boolean;
    /** How long to wait after a record before sending, in milliseconds. */
    readonly pauseMs?: number;
    /** How many events to hold while they cannot be sent. */
    readonly queueLimit?: number;
    readonly now?: () => number;
    readonly id?: () => string;
    /** Where to hear that the page is going. */
    readonly target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | undefined;
}

export const PAUSE_MS = 2_000;
export const QUEUE_LIMIT = 200;

const beacon = (url: string, body: string): boolean => {
    if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function')
        return false;
    try {
        return navigator.sendBeacon(url, body);
    } catch {
        return false;
    }
};

const randomId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

/** Whether the visitor asked not to be tracked, as the browser reports it. */
export const trackingAllowed = (): boolean =>
    typeof navigator === 'undefined' ||
    (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl !== true;

const stripUndefined = (event: Recorded, id: string, at: number): StoreEvent => ({
    id,
    kind: event.kind,
    at,
    ...(event.phrase !== undefined && { phrase: event.phrase }),
    ...(event.sku !== undefined && { sku: event.sku }),
    ...(event.position !== undefined && { position: event.position }),
});

export const createCollector = ({
    url,
    ready = Promise.resolve(),
    allowed = trackingAllowed(),
    send = beacon,
    pauseMs = PAUSE_MS,
    queueLimit = QUEUE_LIMIT,
    now = Date.now,
    id = randomId,
    target = typeof window === 'undefined' ? undefined : window,
}: CollectorOptions): Collector => {
    let queue: StoreEvent[] = [];
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        if (!armed || queue.length === 0) return;
        const batch = queue.slice(0, BATCH_LIMIT);
        if (send(url, JSON.stringify(batch))) queue = queue.slice(batch.length);
    };

    const onHidden = () => {
        if (typeof document === 'undefined' || document.visibilityState === 'hidden') flush();
    };

    const schedule = () => {
        timer ??= setTimeout(flush, pauseMs);
    };

    void ready.then(
        () => {
            armed = true;
            if (queue.length > 0) schedule();
        },
        () => undefined
    );
    target?.addEventListener('pagehide', flush);
    target?.addEventListener('visibilitychange', onHidden);

    return {
        record: (event) => {
            if (!allowed) return;
            queue.push(stripUndefined(event, id(), now()));
            if (queue.length > queueLimit) queue = queue.slice(queue.length - queueLimit);
            schedule();
        },
        flush,
        dispose: () => {
            flush();
            target?.removeEventListener('pagehide', flush);
            target?.removeEventListener('visibilitychange', onHidden);
        },
    };
};
