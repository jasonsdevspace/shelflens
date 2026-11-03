import { type ChangeEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { App } from '../App.jsx';
import { useHeadingFocus } from '../app/focus.js';
import { LiveStatus } from '../app/LiveStatus.jsx';
import { PageTop } from '../app/PageTop.jsx';
import { DemoFooter } from '../app/Portfolio.jsx';
import { Preparing } from '../app/Preparing.jsx';
import { StartFailure, type StartFailureKind } from '../app/StartFailure.jsx';
import { changeCatalog, type Loaded, readLoaded } from '../client/catalog.js';
import { reasonOf } from '../client/reason.js';
import { count } from '../format/count.js';
import { DEFAULT_LOCALE } from '../format/money.js';
import { startFailure } from '../worker/register.js';
import type { Table } from './csv.js';
import { CATALOG_ROW_CAP } from './limits.js';
import { guessMapping, type Mapping } from './mapping.js';
import { MappingEditor, Preview } from './MappingEditor.jsx';
import { type FileLike, readFile } from './read-file.js';
import { SAMPLE_FILE } from './sample.js';
import { type LoadResult, type RowNote, toCatalog } from './to-catalog.js';

/**
 * The page where a visitor searches their own catalog.
 *
 * It asks for a CSV or JSON file, reads it here, says what it found and
 * which column feeds which part of a product, and on the visitor's word
 * hands the catalog to the worker for this page, which keeps it in this
 * browser and builds a store from it. The store is then the same one the
 * demo runs, over the visitor's products. Nothing is uploaded anywhere, and
 * the page says so where the file is chosen.
 */

export interface TryPageProps {
    /** Resolves once this page's own worker controls it. */
    readonly ready: Promise<void>;
    /** Where this page's API is, under its own path. */
    readonly base: string;
}

type Stage =
    | { readonly kind: 'starting' }
    | {
          readonly kind: 'failed';
          readonly failure: StartFailureKind;
          /** What went wrong, said only on the dev server, where the store does not run. */
          readonly message: string;
      }
    | {
          readonly kind: 'choose';
          readonly problem?: string;
          /** Said once the visitor's products were removed, so the removal is not silent. */
          readonly notice?: string;
      }
    | {
          readonly kind: 'review';
          readonly name: string;
          readonly table: Table;
          readonly mapping: Mapping;
          readonly result: LoadResult;
          /** Made from the first rows only, while the whole file is made again after a change. */
          readonly partial?: boolean;
          /** Set once the visitor changes the guess, so each new preview is said. */
          readonly changed?: boolean;
          readonly problem?: string;
          /** Asked first, since this file would replace a catalog the visitor saved rules for. */
          readonly replacing?: boolean;
      }
    | { readonly kind: 'reading'; readonly name: string }
    | { readonly kind: 'loading'; readonly products: number }
    | {
          readonly kind: 'searching';
          readonly loaded: Loaded;
          /** New each time the visitor's file is searched, so the results take focus as they land. */
          readonly arrival?: number;
          readonly problem?: string;
          /** Asked first, since removing the products discards the visitor's saved rules. */
          readonly confirm?: boolean;
          /** Set when focus goes back to the remove button, after a kept or failed removal. */
          readonly focusRemove?: boolean;
      };

/** Why a load failed, in the worker's words when it gave some, with the way to try again. */
const errorOf = async (response: Response, retry: string): Promise<string> => {
    const again = `Press "${retry}" to try again.`;
    const reason = await reasonOf(response);
    return reason
        ? `The store could not use these products, since ${reason}. ${again}`
        : `The store could not load these products (error ${response.status}). ${again}`;
};

/**
 * While the store is built from the visitor's file. Its heading takes the
 * focus the pressed button had, so a keyboard or screen reader user is told
 * what is happening rather than being left at the top of the page.
 */
const Building = ({
    products,
    announce,
}: {
    readonly products: number;
    readonly announce: boolean;
}) => {
    const heading = useHeadingFocus('loading', announce);
    return (
        <section className="try-stage" aria-labelledby="try-building">
            <h1 id="try-building" ref={heading} tabIndex={-1}>
                Building the store from your{' '}
                {count(products, 'product', 'products', DEFAULT_LOCALE)}
            </h1>
        </section>
    );
};

/**
 * Waits until the browser has painted, so a stage set just before slow work
 * shows before that work holds the page.
 */
const nextPaint = () =>
    new Promise<void>((resolve) => {
        // A hidden tab paints no frames, so a timer goes on without one.
        const fallback = setTimeout(resolve, 100);
        if (typeof requestAnimationFrame !== 'function') return;
        requestAnimationFrame(() =>
            setTimeout(() => {
                clearTimeout(fallback);
                resolve();
            }, 0)
        );
    });

/** Where a file is chosen, dropped, or the sample is taken. */
const Chooser = ({
    problem,
    reading,
    notice,
    announce,
    back,
    onFile,
    onSample,
    onBack,
}: {
    readonly problem?: string | undefined;
    /** The file being read, while it is. Another can still be chosen meanwhile. */
    readonly reading?: string | undefined;
    readonly notice?: string | undefined;
    readonly announce: boolean;
    /** Whether products are loaded, when the visitor came here from searching them. */
    readonly back?: boolean | undefined;
    readonly onFile: (file: FileLike) => void;
    readonly onSample: () => void;
    readonly onBack: () => void;
}) => {
    const heading = useHeadingFocus(problem ?? 'choose', announce);
    const [over, setOver] = useState(false);
    const picked = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) onFile(file);
        event.target.value = '';
    };
    return (
        <section className="try-stage" aria-labelledby="try-choose">
            <h1 id="try-choose" ref={heading} tabIndex={-1}>
                Search your own products
            </h1>
            <p>
                Load a CSV or JSON file of products, such as an export from your shop, and search it
                here with suggestions, filters, sorting and a reason for every result. Up to{' '}
                {count(CATALOG_ROW_CAP, 'product', 'products', DEFAULT_LOCALE)}.
            </p>
            <p className="try-private">
                Your file is read in this page and kept in this browser. Nothing is uploaded, and
                clearing this site&rsquo;s data removes it.
            </p>
            {problem && (
                <p className="try-problem" role="alert">
                    {problem}
                </p>
            )}
            <p className="notice" role="status">
                {reading ? `Reading ${reading}.` : ''}
            </p>
            {notice !== undefined && (
                <>
                    <p className="notice">{notice}</p>
                    {/* Filled a moment after it mounts, so it is heard though the page just changed. */}
                    <LiveStatus text={notice} />
                </>
            )}
            {back === true && (
                <p>
                    <button type="button" className="button" onClick={onBack}>
                        {BACK_LABEL}
                    </button>
                </p>
            )}
            <div
                className={`try-drop${over ? ' is-over' : ''}`}
                onDragOver={() => setOver(true)}
                onDragLeave={() => setOver(false)}
                // The page reads the file, so the drop area only lets go of its highlight.
                onDrop={() => setOver(false)}
            >
                <p>Drop a file here, or</p>
                <label className="try-pick">
                    Choose a file
                    <input
                        type="file"
                        accept=".csv,.json,.tsv,.txt,text/csv,application/json"
                        onChange={picked}
                    />
                </label>
            </div>
            <p>
                No file of your own?{' '}
                <button type="button" className="text-button" onClick={onSample}>
                    {SAMPLE_BUTTON}
                </button>
                , or{' '}
                <a href={SAMPLE_FILE} download>
                    download the sample
                </a>{' '}
                to see what a file looks like.
            </p>
        </section>
    );
};

/** The rows a load left out or filled in, the first twenty of them, folded away. */
const RowNotes = ({
    notes,
    summary,
}: {
    readonly notes: readonly RowNote[];
    readonly summary: string;
}) =>
    notes.length === 0 ? null : (
        <details className="try-skipped">
            <summary>{summary}</summary>
            <ul>
                {notes.slice(0, 20).map((note) => (
                    <li key={note.label}>
                        {note.label}: {note.reason}
                    </li>
                ))}
            </ul>
        </details>
    );

/** What the file holds, which column feeds what, and the way on. */
const Review = ({
    announce,
    name,
    table,
    mapping,
    result,
    partial,
    changed,
    problem,
    replacing,
    back,
    onSearch,
    onAnother,
    onMapping,
    onReplace,
    onKeepProducts,
}: {
    readonly announce: boolean;
    /** Whether products are loaded, when the visitor came here from searching them. */
    readonly back?: boolean | undefined;
    readonly name: string;
    readonly table: Table;
    readonly mapping: Mapping;
    readonly result: LoadResult;
    readonly partial: boolean;
    readonly changed: boolean;
    readonly problem?: string | undefined;
    readonly replacing?: boolean | undefined;
    readonly onSearch: () => void;
    readonly onAnother: () => void;
    readonly onMapping: (mapping: Mapping) => void;
    readonly onReplace: () => void;
    readonly onKeepProducts: () => void;
}) => {
    // While the question is asked, it holds focus rather than the heading.
    const heading = useHeadingFocus(name, announce && replacing !== true);
    return (
        <section className="try-stage" aria-labelledby="try-review">
            <h1 id="try-review" ref={heading} tabIndex={-1}>
                What is in {name}
            </h1>
            <p>
                {count(table.rows.length, 'row', 'rows', DEFAULT_LOCALE)} and{' '}
                {count(table.headers.length, 'column', 'columns', DEFAULT_LOCALE)}.
            </p>
            {/* One alert, so a problem and a mapping that cannot make a catalog are heard together. */}
            {(problem !== undefined || !result.ok) && (
                <p className="try-problem" role="alert">
                    {[problem, result.ok ? undefined : result.error]
                        .filter((line) => line !== undefined)
                        .join(' ')}
                </p>
            )}
            {/* The answer first, then the way on, then the guess, so a right guess needs no scrolling
            and a wrong one is put right just below. */}
            {result.ok ? (
                <>
                    <Preview catalog={result.catalog} changed={changed} />
                    {partial ? (
                        <p className="notice" role="status">
                            Checking all {count(table.rows.length, 'row', 'rows', DEFAULT_LOCALE)}.
                        </p>
                    ) : (
                        <>
                            <RowNotes
                                notes={result.skipped}
                                summary={`${count(result.skipped.length, 'row is', 'rows are', DEFAULT_LOCALE)} left out`}
                            />
                            <RowNotes
                                notes={result.notes}
                                summary={`${count(result.notes.length, 'row needed', 'rows needed', DEFAULT_LOCALE)} a default`}
                            />
                        </>
                    )}
                    {replacing === true ? (
                        <Ask
                            question="Searching this file replaces your products and discards the rules you saved for them. Search it anyway?"
                            yes="Yes, search this file"
                            no="Keep my products"
                            onYes={onReplace}
                            onNo={onKeepProducts}
                        />
                    ) : (
                        <div className="try-actions">
                            <button
                                type="button"
                                className="button button-primary"
                                onClick={onSearch}
                            >
                                {partial
                                    ? 'Search these products'
                                    : searchLabel(result.catalog.products.length)}
                            </button>
                            <OtherWays back={back} onAnother={onAnother} onBack={onKeepProducts} />
                        </div>
                    )}
                </>
            ) : (
                <>
                    <div className="try-actions">
                        <OtherWays back={back} onAnother={onAnother} onBack={onKeepProducts} />
                    </div>
                </>
            )}
            <MappingEditor table={table} mapping={mapping} onChange={onMapping} />
        </section>
    );
};

/** The ways off a file: another file, or back to the products already loaded. */
const OtherWays = ({
    back,
    onAnother,
    onBack,
}: {
    readonly back?: boolean | undefined;
    readonly onAnother: () => void;
    readonly onBack: () => void;
}) => (
    <>
        <button type="button" className="button" onClick={onAnother}>
            Choose another file
        </button>
        {back === true && (
            <button type="button" className="button" onClick={onBack}>
                {BACK_LABEL}
            </button>
        )}
    </>
);

/**
 * A question with its two answers. The answer that keeps things as they are
 * takes focus, so a repeated key press never confirms a discard unread.
 */
const Ask = ({
    question,
    yes,
    no,
    onYes,
    onNo,
}: {
    readonly question: string;
    readonly yes: string;
    readonly no: string;
    readonly onYes: () => void;
    readonly onNo: () => void;
}) => {
    const safe = useRef<HTMLButtonElement>(null);
    useLayoutEffect(() => safe.current?.focus(), []);
    return (
        <p className="notice">
            {question}{' '}
            <button type="button" className="text-button" onClick={onYes}>
                {yes}
            </button>{' '}
            <button ref={safe} type="button" className="text-button" onClick={onNo}>
                {no}
            </button>
        </p>
    );
};

/** Above the store, saying whose catalog it is, with the ways to change or remove it. */
const CatalogBar = ({
    loaded,
    problem,
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
        <div className="callout try-bar">
            <span>
                You are searching your own catalog of{' '}
                {count(loaded.products, 'product', 'products', DEFAULT_LOCALE)}, kept in this
                browser.
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
                    <button ref={remove} type="button" className="text-button" onClick={onRemove}>
                        Remove your products
                    </button>{' '}
                    <a className="text-button" href={widgetUrl}>
                        See your products on a store&rsquo;s page
                    </a>
                </>
            )}
            {problem && (
                <p className="try-problem" role="alert">
                    {problem}
                </p>
            )}
        </div>
    );
};

/** Everything before a store is built: starting, choosing, reviewing and loading. */
const BeforeStore = ({
    stage,
    announce,
    onFile,
    onSample,
    onSearch,
    onAnother,
    onMapping,
    onReplace,
    onKeepProducts,
    back,
}: {
    readonly stage: Exclude<Stage, { readonly kind: 'searching' }>;
    /** Whether the visitor's own action brought this stage, so its heading takes focus. */
    readonly announce: boolean;
    /** Whether products are loaded, when the visitor came here from searching them. */
    readonly back: boolean;
    readonly onFile: (file: FileLike) => void;
    readonly onSample: () => void;
    readonly onSearch: () => void;
    readonly onAnother: () => void;
    readonly onMapping: (mapping: Mapping) => void;
    readonly onReplace: () => void;
    readonly onKeepProducts: () => void;
}) => {
    return (
        <>
            <PageTop home="../" />
            <main className="content try">
                {stage.kind === 'starting' && <Preparing />}
                {stage.kind === 'loading' && (
                    <Building products={stage.products} announce={announce} />
                )}
                {stage.kind === 'failed' && (
                    <>
                        <StartFailure kind={stage.failure} />
                        {import.meta.env.DEV && <p className="notice">{stage.message}</p>}
                    </>
                )}
                {stage.kind === 'reading' && (
                    <Chooser
                        announce={announce}
                        reading={stage.name}
                        back={back}
                        onFile={onFile}
                        onSample={onSample}
                        onBack={onKeepProducts}
                    />
                )}
                {stage.kind === 'choose' && (
                    <Chooser
                        announce={announce}
                        problem={stage.problem}
                        notice={stage.notice}
                        back={back}
                        onFile={onFile}
                        onSample={onSample}
                        onBack={onKeepProducts}
                    />
                )}
                {stage.kind === 'review' && (
                    <Review
                        announce={announce}
                        name={stage.name}
                        table={stage.table}
                        mapping={stage.mapping}
                        result={stage.result}
                        partial={stage.partial ?? false}
                        changed={stage.changed ?? false}
                        problem={stage.problem}
                        replacing={stage.replacing}
                        back={back}
                        onSearch={onSearch}
                        onAnother={onAnother}
                        onMapping={onMapping}
                        onReplace={onReplace}
                        onKeepProducts={onKeepProducts}
                    />
                )}
            </main>
            {stage.kind !== 'starting' && <DemoFooter />}
        </>
    );
};

/** The button that loads the sample, named again by a message that offers it and by the explainer. */
const SAMPLE_BUTTON = 'Try it with a sample of 200 products';

/**
 * The button back to the products already loaded. It names no count, since
 * another tab may have changed them since, and the button opens whatever is
 * there.
 */
const BACK_LABEL = 'Back to your products';

/** Said when the way back finds the products gone, as after a removal in another tab. */
const GONE = 'Your products are no longer in this browser, so there is nothing to go back to.';

/** The button that searches a whole file, named again by the messages that point to it. */
const searchLabel = (products: number) =>
    `Search ${count(products, 'product', 'products', DEFAULT_LOCALE)}`;

/** Files up to this many rows are made again on every change, which takes a moment. */
const QUICK_ROWS = 1000;
/** How long a pause in the changes before a larger file is made again whole. */
const CATCH_UP_MS = 300;

/** The first rows of a table, enough to show the preview while the whole is made again. */
const firstRows = (table: Table): Table => ({
    headers: table.headers,
    rows: table.rows.slice(0, 200),
    labels: table.labels.slice(0, 200),
});

/** The way back to the store's first page, so a new catalog never opens on the last one's search. */
const clearSearch = (base: string) => window.history.replaceState(null, '', base);

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const TryPage = ({ ready, base }: TryPageProps) => {
    const [stage, setStage] = useState<Stage>({ kind: 'starting' });
    // Set once the visitor does something, so stages after that take focus.
    const [acted, setActed] = useState(false);
    // Counts the files asked for, so one read slowly never replaces one picked after it.
    const asked = useRef(0);
    // Set while a load or a removal is with the worker, so a second press waits.
    const pending = useRef(false);
    // The search the visitor left when they chose another file.
    const lastSearch = useRef('');
    // Set while products are loaded and the visitor looks at another file, so they can go back.
    const [back, setBack] = useState(false);
    const catalogUrl = `${base}catalog`;

    useEffect(() => {
        let live = true;
        ready
            .then(() => readLoaded(catalogUrl))
            .then(
                (loaded) => {
                    if (live) setStage(loaded ? { kind: 'searching', loaded } : { kind: 'choose' });
                },
                (error: unknown) => {
                    if (live) {
                        setStage({
                            kind: 'failed',
                            failure: startFailure(error),
                            message: messageOf(error),
                        });
                    }
                }
            );
        return () => {
            live = false;
        };
    }, [ready, catalogUrl]);

    const onFile = useCallback(async (file: FileLike) => {
        setActed(true);
        asked.current += 1;
        const mine = asked.current;
        setStage({ kind: 'reading', name: file.name });
        try {
            const table = await readFile(file);
            const mapping = guessMapping(table);
            const result = toCatalog(table, mapping);
            if (mine === asked.current) {
                setStage({ kind: 'review', name: file.name, table, mapping, result });
            }
        } catch (error) {
            if (mine === asked.current) setStage({ kind: 'choose', problem: messageOf(error) });
        }
    }, []);

    // A file dropped anywhere on the page is read wherever a file can be taken, and is never
    // opened by the browser in the page's place, which would lose whatever the visitor had.
    const takesFile =
        stage.kind === 'choose' || stage.kind === 'reading' || stage.kind === 'review';
    useEffect(() => {
        const hold = (event: DragEvent) => event.preventDefault();
        const dropped = (event: DragEvent) => {
            event.preventDefault();
            const file = event.dataTransfer?.files[0];
            if (file && takesFile) void onFile(file);
        };
        window.addEventListener('dragover', hold);
        window.addEventListener('drop', dropped);
        return () => {
            window.removeEventListener('dragover', hold);
            window.removeEventListener('drop', dropped);
        };
    }, [takesFile, onFile]);

    const onSample = useCallback(async () => {
        setActed(true);
        try {
            const response = await fetch(`${base}${SAMPLE_FILE}`);
            if (!response.ok) throw new Error(`error ${response.status}`);
            const text = await response.text();
            await onFile({
                name: SAMPLE_FILE,
                size: text.length,
                text: () => Promise.resolve(text),
            });
        } catch (error) {
            setStage({
                kind: 'choose',
                problem: `The sample could not be loaded (${messageOf(error)}). Press "${SAMPLE_BUTTON}" again, or download the sample and choose it as a file.`,
            });
        }
    }, [base, onFile]);

    // Loading a file replaces the products being searched, and the worker
    // refuses to when that would discard the visitor's saved rules, so the
    // page asks then and loads again once the visitor agrees.
    const load = useCallback(
        async (discardRules: boolean) => {
            if (stage.kind !== 'review' || pending.current) return;
            const { replacing: _asked, ...current } = stage;
            const whole = current.partial
                ? toCatalog(current.table, current.mapping)
                : current.result;
            const review = { ...current, result: whole, partial: false };
            if (!whole.ok) {
                setStage(review);
                return;
            }
            const { catalog } = whole;
            const retry = searchLabel(catalog.products.length);
            pending.current = true;
            setStage({ kind: 'loading', products: catalog.products.length });
            try {
                // Preparing a large file for the worker holds the page, so the stage shows first.
                await nextPaint();
                const response = await changeCatalog(
                    catalogUrl,
                    { method: 'PUT', body: JSON.stringify(catalog) },
                    discardRules
                );
                if (response === 'refused') {
                    const { problem: _last, ...asking } = review;
                    setStage({ ...asking, replacing: true });
                    return;
                }
                if (!response.ok) {
                    setStage({ ...review, problem: await errorOf(response, retry) });
                    return;
                }
                // The products the visitor could have gone back to are replaced now.
                setBack(false);
                const loaded = await readLoaded(catalogUrl);
                clearSearch(base);
                setStage(
                    loaded
                        ? { kind: 'searching', loaded, arrival: performance.now() }
                        : {
                              ...review,
                              problem: `The store did not keep your products. Press "${retry}" to try again.`,
                          }
                );
            } catch (error) {
                setStage({
                    ...review,
                    problem: `The store could not be reached (${messageOf(error)}). Press "${retry}" to try again.`,
                });
            } finally {
                pending.current = false;
            }
        },
        [stage, catalogUrl, base]
    );

    // Back to the products the visitor was searching, with their search, from the chooser or
    // from a file they looked at instead. Pressing it is the visitor's latest choice, so a file
    // still being read is let go, and a file chosen while the products are read wins over it.
    const keepProducts = useCallback(async () => {
        if (stage.kind !== 'choose' && stage.kind !== 'reading' && stage.kind !== 'review') return;
        if (pending.current) return;
        const from = stage;
        asked.current += 1;
        const mine = asked.current;
        pending.current = true;
        try {
            const loaded = await readLoaded(catalogUrl);
            if (mine !== asked.current) return;
            if (loaded) {
                setBack(false);
                window.history.replaceState(null, '', `${base}${lastSearch.current}`);
                setStage({ kind: 'searching', loaded });
                return;
            }
            setBack(false);
            if (from.kind !== 'review') setStage({ kind: 'choose', problem: GONE });
            else if (from.replacing === true) {
                // Only the saved rules are left, and searching this file still discards them,
                // so the question stays.
                setStage({
                    ...from,
                    problem:
                        'Your products are no longer in this browser, so there is nothing to keep. Press "Yes, search this file" to search it.',
                });
            } else setStage({ ...from, problem: GONE });
        } catch (error) {
            if (mine !== asked.current) return;
            const problem = `Your products could not be read (${messageOf(error)}). Reload the page to get back to them.`;
            if (from.kind === 'review') {
                const { replacing: _asked, ...rest } = from;
                setStage({ ...rest, problem });
            } else setStage({ kind: 'choose', problem });
        } finally {
            pending.current = false;
        }
    }, [stage, catalogUrl, base]);

    // Removing the products discards the visitor's saved rules, so the worker
    // refuses to unless the visitor agreed, and the page asks then.
    const onRemove = useCallback(
        async (discardRules: boolean) => {
            if (stage.kind !== 'searching' || pending.current) return;
            const { loaded } = stage;
            pending.current = true;
            setActed(true);
            try {
                const response = await changeCatalog(
                    catalogUrl,
                    { method: 'DELETE' },
                    discardRules
                );
                if (response === 'refused') {
                    setStage({ kind: 'searching', loaded, confirm: true });
                    return;
                }
                if (!response.ok) throw new Error(`error ${response.status}`);
                clearSearch(base);
                setStage({
                    kind: 'choose',
                    notice: discardRules
                        ? 'Your products and the rules you saved for them were removed from this browser.'
                        : 'Your products were removed from this browser.',
                });
            } catch (error) {
                setStage({
                    kind: 'searching',
                    loaded,
                    focusRemove: true,
                    problem: `Your products could not be removed (${messageOf(error)}), so they are still here. Try again.`,
                });
            } finally {
                pending.current = false;
            }
        },
        [stage, catalogUrl, base]
    );

    // A changed mapping is a new catalog, made again from the rows already read. A small
    // file is made again at once. A large one shows its first rows at once and is made
    // again whole once the visitor pauses, so each change stays quick on a phone.
    const onMapping = useCallback(
        (mapping: Mapping) => {
            if (stage.kind !== 'review') return;
            const { problem: _last, ...review } = stage;
            const quick = stage.table.rows.length <= QUICK_ROWS;
            const result = toCatalog(quick ? stage.table : firstRows(stage.table), mapping);
            setStage({ ...review, mapping, result, partial: !quick, changed: true });
        },
        [stage]
    );

    useEffect(() => {
        if (stage.kind !== 'review' || !stage.partial) return undefined;
        const timer = window.setTimeout(() => {
            setStage((current) =>
                current.kind === 'review' && current.mapping === stage.mapping
                    ? {
                          ...current,
                          result: toCatalog(current.table, current.mapping),
                          partial: false,
                      }
                    : current
            );
        }, CATCH_UP_MS);
        return () => window.clearTimeout(timer);
    }, [stage]);

    const onAnother = useCallback(() => {
        // Nothing moves while a change is with the worker, so its answer lands where it was asked.
        if (pending.current) return;
        setActed(true);
        // Kept, so a visitor who keeps their products is taken back to their search.
        if (stage.kind === 'searching') {
            lastSearch.current = window.location.search;
            setBack(true);
        }
        clearSearch(base);
        setStage({ kind: 'choose' });
    }, [base, stage]);

    const focused = useCallback(() => {
        setStage((current) => {
            if (current.kind !== 'searching' || current.focusRemove !== true) return current;
            const { focusRemove: _done, ...rest } = current;
            return rest;
        });
    }, []);

    const keepRules = useCallback(() => {
        if (pending.current) return;
        setStage((current) =>
            current.kind === 'searching'
                ? { kind: 'searching', loaded: current.loaded, focusRemove: true }
                : current
        );
    }, []);

    if (stage.kind === 'searching') {
        return (
            <App
                key={stage.loaded.version}
                apiUrl={`${base}graphql`}
                eventsUrl={`${base}events`}
                rulesUrl={`${base}rules`}
                ready="started"
                tour={false}
                arrival={stage.arrival}
                banner={
                    <CatalogBar
                        loaded={stage.loaded}
                        problem={stage.problem}
                        confirm={stage.confirm}
                        focusRemove={stage.focusRemove}
                        onAnother={onAnother}
                        onRemove={() => void onRemove(false)}
                        onConfirm={() => void onRemove(true)}
                        onKeep={keepRules}
                        onFocused={focused}
                        widgetUrl={`${base}widget/`}
                    />
                }
            />
        );
    }

    return (
        <BeforeStore
            stage={stage}
            announce={acted}
            onFile={(file) => void onFile(file)}
            onSample={() => void onSample()}
            onSearch={() => void load(false)}
            onAnother={onAnother}
            onMapping={onMapping}
            onReplace={() => void load(true)}
            onKeepProducts={() => void keepProducts()}
            back={back}
        />
    );
};
