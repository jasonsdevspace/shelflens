/**
 * What a page says when its store did not start. A browser that cannot run
 * the store is told what to do instead, with nothing to retry. A store that
 * did not start this time offers to try again, which a fresh load does.
 * Shared by the store and the page for a visitor's products, so the two say
 * the same thing.
 */
export type StartFailureKind = 'unsupported' | 'unavailable';

const reloadPage = () => globalThis.location.reload();

export const StartFailure = ({
    kind,
    retry = reloadPage,
}: {
    readonly kind: StartFailureKind;
    /** Starts the store again. Tests pass their own, since a document cannot reload. */
    readonly retry?: (() => void) | undefined;
}) =>
    kind === 'unsupported' ? (
        <div className="notice standby" role="alert">
            <h1 className="results-heading">The store could not start in this browser</h1>
            <p>
                It runs as a small program the page installs, and this browser did not allow it.
                Open this page in a regular, non-private window.
            </p>
        </div>
    ) : (
        <div className="notice standby" role="alert">
            <h1 className="results-heading">The store could not start</h1>
            <p>Check your connection and try again.</p>
            <button type="button" className="standby-retry" onClick={retry}>
                Try again
            </button>
        </div>
    );
