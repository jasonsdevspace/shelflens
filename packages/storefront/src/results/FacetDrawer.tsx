import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

/**
 * The facets as a drawer, for a phone.
 *
 * A button opens a panel over the results. While it is open it is modal:
 * focus starts on the close button, Tab cycles inside it, Escape and the
 * backdrop close it, and focus returns to the button that opened it. The
 * shopper can tick several facets and then see the results in one step.
 */

export interface FacetDrawerProps {
    /** How many facets are narrowing the results, shown on the button. */
    readonly active: number;
    /** How many results the current facets give, shown on the way out. */
    readonly total: number;
    readonly children: ReactNode;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const FacetDrawer = ({ active, total, children }: FacetDrawerProps) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const opener = useRef<HTMLButtonElement>(null);
    const closer = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (open) {
            closer.current?.focus();
        } else {
            opener.current?.focus({ preventScroll: true });
        }
    }, [open]);

    const trap = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    return (
        <div className="drawer">
            <button
                ref={opener}
                type="button"
                className="drawer-open"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
            >
                Filters{active > 0 && <span className="drawer-badge"> {active}</span>}
            </button>
            {open && (
                <div
                    className="drawer-backdrop"
                    onClick={() => setOpen(false)}
                    aria-hidden="true"
                />
            )}
            {open && (
                <div
                    className="drawer-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`${id}-title`}
                    onKeyDown={trap}
                >
                    <div className="drawer-head">
                        <h2 id={`${id}-title`} className="drawer-title">
                            Filters
                        </h2>
                        <button
                            ref={closer}
                            type="button"
                            className="drawer-close"
                            onClick={() => setOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                    <div className="drawer-body">{children}</div>
                    <button type="button" className="drawer-done" onClick={() => setOpen(false)}>
                        Show {total} results
                    </button>
                </div>
            )}
        </div>
    );
};
