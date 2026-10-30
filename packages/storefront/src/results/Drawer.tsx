import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';

/**
 * A panel over the results, for a phone.
 *
 * A button opens it. While it is open it is modal: focus starts on the
 * close button, Tab cycles inside it, Escape and the backdrop close it, and
 * focus returns to the button that opened it. The facets and the rules
 * panel both take this shape, with their own words on the buttons.
 */

export interface DrawerProps {
    /** What the opening button says. */
    readonly opener: ReactNode;
    readonly title: string;
    /** What the button at the bottom says, which closes the drawer. */
    readonly done: string;
    readonly children: ReactNode;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const Drawer = ({ opener, title, done, children }: DrawerProps) => {
    const id = useId();
    const [open, setOpen] = useState(false);
    const openButton = useRef<HTMLButtonElement>(null);
    const closer = useRef<HTMLButtonElement>(null);
    // Focus goes back to the opener after a close, and only then. On mount the drawer
    // is closed and nothing was opened, so the results keep whatever focus they had.
    const wasOpen = useRef(false);

    useEffect(() => {
        if (open) {
            wasOpen.current = true;
            closer.current?.focus();
        } else if (wasOpen.current) {
            wasOpen.current = false;
            openButton.current?.focus({ preventScroll: true });
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
                ref={openButton}
                type="button"
                className="drawer-open"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
            >
                {opener}
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
                            {title}
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
                        {done}
                    </button>
                </div>
            )}
        </div>
    );
};
