import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

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
    /** Whether what the drawer holds stays mounted while it is closed, as a form being typed must. */
    readonly keep?: boolean;
    readonly children: ReactNode;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export const Drawer = ({ opener, title, done, keep = false, children }: DrawerProps) => {
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

    // On the document while open, so Escape and Tab still work when a choice in the
    // drawer took away the control that had focus.
    const panel = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return undefined;
        const trap = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
                return;
            }
            if (event.key !== 'Tab' || !panel.current) return;
            const focusable = panel.current.querySelectorAll<HTMLElement>(FOCUSABLE);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!first || !last) return;
            const inside = panel.current.contains(document.activeElement);
            if (!inside || (event.shiftKey && document.activeElement === first)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', trap);
        return () => document.removeEventListener('keydown', trap);
    }, [open]);

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
            {(open || keep) && (
                <div
                    className="drawer-panel"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`${id}-title`}
                    hidden={!open}
                    ref={panel}
                >
                    <div className="drawer-head">
                        <h2 id={`${id}-title`} className="drawer-title" tabIndex={-1}>
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
