import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';

import { App } from '../App.jsx';
import { DemoFooter, PortfolioStrip } from '../app/Portfolio.jsx';
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

interface Loaded {
    readonly version: string;
    readonly products: number;
    readonly memberPrices: boolean;
}

type Stage =
    | { readonly kind: 'starting' }
    | { readonly kind: 'failed'; readonly message: string }
    | { readonly kind: 'choose'; readonly problem?: string }
    | {
          readonly kind: 'review';
          readonly name: string;
          readonly table: Table;
          readonly mapping: Mapping;
          readonly result: LoadResult;
          /** Made from the first rows only, while the whole file is made again after a change. */
          readonly partial?: boolean;
          readonly problem?: string;
          /** Asked first, since this file would replace a catalog the visitor saved rules for. */
          readonly replacing?: boolean;
      }
    | { readonly kind: 'reading'; readonly name: string }
    | { readonly kind: 'loading' }
    | {
          readonly kind: 'searching';
          readonly loaded: Loaded;
          readonly problem?: string;
          /** Asked first, since removing the products discards the visitor's saved rules. */
          readonly confirm?: boolean;
          /** Set when focus goes back to the remove button, after a kept or failed removal. */
          readonly focusRemove?: boolean;
      };

const count = (n: number, one: string, many: string) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * Sends a change to the visitor's catalog. The worker refuses one that would
 * discard the visitor's saved rules unless the visitor agreed, and that
 * refusal comes back as `refused` for the page to ask.
 */
const changeCatalog = async (
    url: string,
    init: RequestInit,
    discardRules: boolean
): Promise<Response | 'refused'> => {
    const response = await fetch(discardRules ? `${url}?discard-rules=yes` : url, init);
    return response.status === 409 ? 'refused' : response;
};

/** What the worker says is loaded, or nothing. */
const fetchLoaded = async (url: string): Promise<Loaded | undefined> => {
    const response = await fetch(url);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`the store answered ${response.status}`);
    return (await response.json()) as Loaded;
};

/** Why a load failed, in the worker's words when it gave some, with the way to try again. */
const errorOf = async (response: Response, retry: string): Promise<string> => {
    const again = `Press "${retry}" to try again.`;
    let reason: string | undefined;
    try {
        const body = (await response.json()) as { errors?: { message?: string }[] };
        reason = body.errors?.[0]?.message;
    } catch {
        reason = undefined;
    }
    return reason
        ? `The store could not use these products, since ${reason}. ${again}`
        : `The store could not load these products (error ${response.status}). ${again}`;
};

/**
 * Moves focus to a stage's heading when it appears because of something the
 * visitor did, so a keyboard or screen reader user is told where they are.
 * On the page's first load the heading is left alone, as any page's is.
 */
const useHeadingFocus = (key: string, announce: boolean) => {
    const heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (announce) heading.current?.focus();
    }, [key, announce]);
    return heading;
};

/** Where a file is chosen, dropped, or the sample is taken. */
const Chooser = ({
    problem,
    reading,
    announce,
    onFile,
    onSample,
}: {
    readonly problem?: string | undefined;
    /** The file being read, while it is. Another can still be chosen meanwhile. */
    readonly reading?: string | undefined;
    readonly announce: boolean;
    readonly onFile: (file: FileLike) => void;
    readonly onSample: () => void;
}) => {
    const heading = useHeadingFocus(problem ?? 'choose', announce);
    const [over, setOver] = useState(false);
    const dropped = (event: DragEvent) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
    };
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
                {count(CATALOG_ROW_CAP, 'product', 'products')}.
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
            <div
                className={`try-drop${over ? ' is-over' : ''}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setOver(true);
                }}
                onDragLeave={() => setOver(false)}
                onDrop={dropped}
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
                <button type="button" className="try-link" onClick={onSample}>
                    Try it with a sample of 200 products
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
    problem,
    replacing,
    onSearch,
    onAnother,
    onMapping,
    onReplace,
    onKeepProducts,
}: {
    readonly announce: boolean;
    readonly name: string;
    readonly table: Table;
    readonly mapping: Mapping;
    readonly result: LoadResult;
    readonly partial: boolean;
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
                {count(table.rows.length, 'row', 'rows')} and{' '}
                {count(table.headers.length, 'column', 'columns')}.
            </p>
            <MappingEditor table={table} mapping={mapping} onChange={onMapping} />
            {result.ok ? (
                <>
                    <Preview catalog={result.catalog} />
                    {partial ? (
                        <p className="notice" role="status">
                            Checking all {count(table.rows.length, 'row', 'rows')}.
                        </p>
                    ) : (
                        <>
                            <RowNotes
                                notes={result.skipped}
                                summary={`${count(result.skipped.length, 'row is', 'rows are')} left out`}
                            />
                            <RowNotes
                                notes={result.notes}
                                summary={`${count(result.notes.length, 'row needed', 'rows needed')} a default`}
                            />
                        </>
                    )}
                    {problem && (
                        <p className="try-problem" role="alert">
                            {problem}
                        </p>
                    )}
                    {replacing === true ? (
                        <Ask
                            question="This file replaces the products you are searching, and your rules go with them. Search it anyway?"
                            yes="Yes, search this file"
                            no="Keep my products"
                            onYes={onReplace}
                            onNo={onKeepProducts}
                        />
                    ) : (
                        <div className="try-actions">
                            <button type="button" className="try-primary" onClick={onSearch}>
                                {partial
                                    ? 'Search these products'
                                    : `Search ${count(result.catalog.products.length, 'product', 'products')}`}
                            </button>
                            <button type="button" onClick={onAnother}>
                                Choose another file
                            </button>
                        </div>
                    )}
                </>
            ) : (
                <>
                    <p className="try-problem" role="alert">
                        {result.error}
                    </p>
                    <div className="try-actions">
                        <button type="button" onClick={onAnother}>
                            Choose another file
                        </button>
                    </div>
                </>
            )}
        </section>
    );
};

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
    useEffect(() => safe.current?.focus(), []);
    return (
        <p className="notice">
            {question}{' '}
            <button type="button" className="try-link" onClick={onYes}>
                {yes}
            </button>{' '}
            <button ref={safe} type="button" className="try-link" onClick={onNo}>
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
}) => {
    const remove = useRef<HTMLButtonElement>(null);
    // After a removal kept or failed, the visitor is put back on the button they
    // pressed, once, so a later render never takes focus from them again.
    useEffect(() => {
        if (focusRemove === true && confirm !== true) {
            remove.current?.focus();
            onFocused();
        }
    }, [focusRemove, confirm, onFocused]);
    return (
        <div className="results-aside try-bar">
            <span>
                You are searching your own catalog of{' '}
                {count(loaded.products, 'product', 'products')}, kept in this browser.
            </span>{' '}
            {confirm === true ? (
                <Ask
                    question="Your rules go with these products, so removing them discards your rules too. Remove them anyway?"
                    yes="Yes, remove them"
                    no="Keep my rules"
                    onYes={onConfirm}
                    onNo={onKeep}
                />
            ) : (
                <>
                    <button type="button" className="try-link" onClick={onAnother}>
                        Choose another file
                    </button>{' '}
                    <button ref={remove} type="button" className="try-link" onClick={onRemove}>
                        Remove your products
                    </button>{' '}
                    <a className="try-link" href="widget/">
                        See them on a store&rsquo;s page
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
}: {
    readonly stage: Exclude<Stage, { readonly kind: 'searching' }>;
    /** Whether the visitor's own action brought this stage, so its heading takes focus. */
    readonly announce: boolean;
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
            <PortfolioStrip />
            <header className="masthead">
                <div className="masthead-row">
                    <a className="brand" href="../">
                        ShelfLens
                    </a>
                </div>
            </header>
            <main className="content try">
                {stage.kind === 'starting' && <p className="notice">Preparing the store.</p>}
                {stage.kind === 'loading' && (
                    <p className="notice" role="status">
                        Building the store from your products.
                    </p>
                )}
                {stage.kind === 'failed' && (
                    <p className="notice" role="alert">
                        The store could not start in this browser ({stage.message}). It runs as a
                        small program the page installs, and this browser did not allow it. A
                        regular, non-private window usually does.
                    </p>
                )}
                {stage.kind === 'reading' && (
                    <Chooser
                        announce={announce}
                        reading={stage.name}
                        onFile={onFile}
                        onSample={onSample}
                    />
                )}
                {stage.kind === 'choose' && (
                    <Chooser
                        announce={announce}
                        problem={stage.problem}
                        onFile={onFile}
                        onSample={onSample}
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
                        problem={stage.problem}
                        replacing={stage.replacing}
                        onSearch={onSearch}
                        onAnother={onAnother}
                        onMapping={onMapping}
                        onReplace={onReplace}
                        onKeepProducts={onKeepProducts}
                    />
                )}
            </main>
            <DemoFooter />
        </>
    );
};

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
    const catalogUrl = `${base}catalog`;

    useEffect(() => {
        let live = true;
        ready
            .then(() => fetchLoaded(catalogUrl))
            .then(
                (loaded) => {
                    if (live) setStage(loaded ? { kind: 'searching', loaded } : { kind: 'choose' });
                },
                (error: unknown) => {
                    if (live) setStage({ kind: 'failed', message: messageOf(error) });
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
                problem: `The sample could not be loaded (${messageOf(error)}). Try again, or download it below.`,
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
            const retry = `Search ${count(catalog.products.length, 'product', 'products')}`;
            pending.current = true;
            setStage({ kind: 'loading' });
            try {
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
                const loaded = await fetchLoaded(catalogUrl);
                clearSearch(base);
                setStage(
                    loaded
                        ? { kind: 'searching', loaded }
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

    // Back to the products the visitor was searching, with their search.
    const keepProducts = useCallback(async () => {
        if (stage.kind !== 'review' || pending.current) return;
        const review = stage;
        pending.current = true;
        try {
            const loaded = await fetchLoaded(catalogUrl);
            if (!loaded) throw new Error('nothing is loaded');
            window.history.replaceState(null, '', `${base}${lastSearch.current}`);
            setStage({ kind: 'searching', loaded });
        } catch (error) {
            const { replacing: _asked, ...back } = review;
            setStage({
                ...back,
                problem: `Your products could not be read (${messageOf(error)}). Reload the page to get back to them.`,
            });
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
                setStage({ kind: 'choose' });
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
            setStage({ ...review, mapping, result, partial: !quick });
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
        if (stage.kind === 'searching') lastSearch.current = window.location.search;
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
                ready={Promise.resolve()}
                tour={false}
                viewerSwitch={stage.loaded.memberPrices}
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
        />
    );
};
