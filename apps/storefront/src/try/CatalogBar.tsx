import { useLayoutEffect, useRef } from 'react';

import { LiveStatus } from '../app/LiveStatus.jsx';
import type { Loaded } from '../client/catalog.js';
import { count } from '../format/count.js';
import { DEFAULT_LOCALE } from '../format/locale.js';
import { Ask, ProblemAlert } from './stages.jsx';

/** Above the store, saying whose catalog it is, with the ways to change or remove it. */
export const CatalogBar = ({
    loaded,
    problem,
    problemAt,
    notice,
    confirm,
    focusRemove,
    onAnother,
    onRemove,
    onConfirm,
    onKeep,
    onFocused,
    widgetUrl,
}: {
    readonly loaded: Loaded;
    readonly problem?: string | undefined;
    readonly problemAt?: number | undefined;
    readonly notice?: string | undefined;
    readonly confirm?: boolean | undefined;
    readonly focusRemove?: boolean | undefined;
    readonly onAnother: () => void;
    readonly onRemove: () => void;
    readonly onConfirm: () => void;
    readonly onKeep: () => void;
    readonly onFocused: () => void;
    /** The store's page that embeds the search box over these products. */
    readonly widgetUrl: string;
}) => {
    const remove = useRef<HTMLButtonElement>(null);
    // After a removal kept or failed, the visitor is put back on the button they
    // pressed, once, so a later render never takes focus from them again.
    useLayoutEffect(() => {
        if (focusRemove === true && confirm !== true) {
            remove.current?.focus();
            onFocused();
        }
    }, [focusRemove, confirm, onFocused]);
    return (
        <>
            <div className="callout try-bar">
                <span>
                    You are searching the{' '}
                    {count(loaded.products, 'product', 'products', DEFAULT_LOCALE)} you loaded, kept
                    in this browser.
                </span>{' '}
                {confirm === true ? (
                    <Ask
                        question="Removing your products also discards the rules you saved for them. Remove them anyway?"
                        yes="Yes, remove them"
                        no="Keep my products"
                        onYes={onConfirm}
                        onNo={onKeep}
                    />
                ) : (
                    <>
                        <button type="button" className="text-button" onClick={onAnother}>
                            Choose another file
                        </button>{' '}
                        <button
                            ref={remove}
                            type="button"
                            className="text-button"
                            onClick={onRemove}
                        >
                            Remove your products
                        </button>{' '}
                        <a className="text-button" href={widgetUrl}>
                            See your products on a store&rsquo;s page
                        </a>
                    </>
                )}
            </div>
            {/* Under the bar rather than in it, so an empty alert takes no room among its actions. */}
            {notice !== undefined && (
                <>
                    <p className="notice">{notice}</p>
                    <LiveStatus text={notice} />
                </>
            )}
            {/* Made anew for each failure, so the same words a second time are heard again. */}
            <ProblemAlert key={problemAt} problem={problem} />
        </>
    );
};
