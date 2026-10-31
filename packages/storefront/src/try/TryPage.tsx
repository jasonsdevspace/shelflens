import { type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from 'react';

import { App } from '../App.jsx';
import { DemoFooter, PortfolioStrip } from '../app/Portfolio.jsx';
import type { Table } from './csv.js';
import { CATALOG_ROW_CAP } from './limits.js';
import { guessMapping, type MappedField, type Mapping } from './mapping.js';
import { type FileLike, readFile } from './read-file.js';
import { SAMPLE_PATH } from './sample.js';
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
          readonly problem?: string;
      }
    | { readonly kind: 'loading' }
    | { readonly kind: 'searching'; readonly loaded: Loaded };

const FIELD_LABELS: Readonly<Record<MappedField, string>> = {
    name: 'Name',
    price: 'Price',
    description: 'Description',
    brand: 'Brand',
    category: 'Category',
    colors: 'Colors',
    sizes: 'Sizes',
    material: 'Material',
    memberPrice: 'Member price',
    rating: 'Rating',
    ratingCount: 'Number of reviews',
    inStock: 'In stock',
    id: 'Product ID',
};

const count = (n: number, one: string, many: string) =>
    `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** What the worker says is loaded, or nothing. */
const fetchLoaded = async (url: string): Promise<Loaded | undefined> => {
    const response = await fetch(url);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`the store answered ${response.status}`);
    return (await response.json()) as Loaded;
};

/** Why a load failed, in the worker's words when it gave some, with the way to try again. */
const errorOf = async (response: Response, retry: string): Promise<string> => {
    const fallback = `The store could not load these products (error ${response.status}). Press "${retry}" to try again.`;
    try {
        const body = (await response.json()) as { errors?: { message?: string }[] };
        return body.errors?.[0]?.message ?? fallback;
    } catch {
        return fallback;
    }
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
    announce,
    onFile,
    onSample,
}: {
    readonly problem?: string | undefined;
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
                <a href={SAMPLE_PATH.replace(/^try\//, '')} download>
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
    problem,
    onSearch,
    onAnother,
}: {
    readonly announce: boolean;
    readonly name: string;
    readonly table: Table;
    readonly mapping: Mapping;
    readonly result: LoadResult;
    readonly problem?: string | undefined;
    readonly onSearch: () => void;
    readonly onAnother: () => void;
}) => {
    const heading = useHeadingFocus(`${name}:${problem ?? ''}`, announce);
    const used = new Set(Object.values(mapping).flat());
    const unused = table.headers.filter((header) => !used.has(header));
    const fields = (Object.keys(FIELD_LABELS) as MappedField[]).filter((field) => mapping[field]);
    return (
        <section className="try-stage" aria-labelledby="try-review">
            <h1 id="try-review" ref={heading} tabIndex={-1}>
                What is in {name}
            </h1>
            <p>
                {count(table.rows.length, 'row', 'rows')} and{' '}
                {count(table.headers.length, 'column', 'columns')}.
            </p>
            <h2>Where each part of a product comes from</h2>
            <dl className="try-mapping">
                {fields.map((field) => (
                    <div key={field}>
                        <dt>{FIELD_LABELS[field]}</dt>
                        <dd>{mapping[field]}</dd>
                    </div>
                ))}
            </dl>
            {unused.length > 0 && <p className="notice">Not used: {unused.join(', ')}.</p>}
            {result.ok ? (
                <>
                    <RowNotes
                        notes={result.skipped}
                        summary={`${count(result.skipped.length, 'row is', 'rows are')} left out`}
                    />
                    <RowNotes
                        notes={result.notes}
                        summary={`${count(result.notes.length, 'row needed', 'rows needed')} a default`}
                    />
                    {problem && (
                        <p className="try-problem" role="alert">
                            {problem}
                        </p>
                    )}
                    <div className="try-actions">
                        <button type="button" className="try-primary" onClick={onSearch}>
                            Search {count(result.catalog.products.length, 'product', 'products')}
                        </button>
                        <button type="button" onClick={onAnother}>
                            Choose another file
                        </button>
                    </div>
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

/** Above the store, saying whose catalog it is, with the ways to change or remove it. */
const CatalogBar = ({
    loaded,
    onAnother,
    onRemove,
}: {
    readonly loaded: Loaded;
    readonly onAnother: () => void;
    readonly onRemove: () => void;
}) => (
    <div className="results-aside try-bar">
        <span>
            You are searching your own catalog of {count(loaded.products, 'product', 'products')},
            kept in this browser.
        </span>{' '}
        <button type="button" className="try-link" onClick={onAnother}>
            Choose another file
        </button>{' '}
        <button type="button" className="try-link" onClick={onRemove}>
            Remove your products
        </button>
    </div>
);

/** Everything before a store is built: starting, choosing, reviewing and loading. */
const BeforeStore = ({
    stage,
    announce,
    onFile,
    onSample,
    onSearch,
    onAnother,
}: {
    readonly stage: Exclude<Stage, { readonly kind: 'searching' }>;
    /** Whether the visitor's own action brought this stage, so its heading takes focus. */
    readonly announce: boolean;
    readonly onFile: (file: FileLike) => void;
    readonly onSample: () => void;
    readonly onSearch: () => void;
    readonly onAnother: () => void;
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
                        problem={stage.problem}
                        onSearch={onSearch}
                        onAnother={onAnother}
                    />
                )}
            </main>
            <DemoFooter />
        </>
    );
};

const SAMPLE_NAME = 'sample-products.csv';

export const TryPage = ({ ready, base }: TryPageProps) => {
    const [stage, setStage] = useState<Stage>({ kind: 'starting' });
    // Set once the visitor does something, so stages after that take focus.
    const [acted, setActed] = useState(false);
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
                    const message = error instanceof Error ? error.message : String(error);
                    if (live) setStage({ kind: 'failed', message });
                }
            );
        return () => {
            live = false;
        };
    }, [ready, catalogUrl]);

    const onFile = useCallback(async (file: FileLike) => {
        setActed(true);
        try {
            const table = await readFile(file);
            const mapping = guessMapping(table);
            setStage({
                kind: 'review',
                name: file.name,
                table,
                mapping,
                result: toCatalog(table, mapping),
            });
        } catch (error) {
            setStage({
                kind: 'choose',
                problem: error instanceof Error ? error.message : String(error),
            });
        }
    }, []);

    const onSample = useCallback(async () => {
        const response = await fetch(`${base}${SAMPLE_NAME}`);
        const text = await response.text();
        await onFile({ name: SAMPLE_NAME, size: text.length, text: () => Promise.resolve(text) });
    }, [base, onFile]);

    const onSearch = useCallback(async () => {
        if (stage.kind !== 'review' || !stage.result.ok) return;
        const review = stage;
        const { catalog } = stage.result;
        const retry = `Search ${count(catalog.products.length, 'product', 'products')}`;
        setStage({ kind: 'loading' });
        const response = await fetch(catalogUrl, { method: 'PUT', body: JSON.stringify(catalog) });
        if (!response.ok) {
            setStage({ ...review, problem: await errorOf(response, retry) });
            return;
        }
        const loaded = await fetchLoaded(catalogUrl);
        setStage(
            loaded
                ? { kind: 'searching', loaded }
                : {
                      ...review,
                      problem: `The store did not keep your products. Press "${retry}" to try again.`,
                  }
        );
    }, [stage, catalogUrl]);

    const onRemove = useCallback(async () => {
        setActed(true);
        await fetch(catalogUrl, { method: 'DELETE' });
        window.history.replaceState(null, '', base);
        setStage({ kind: 'choose' });
    }, [catalogUrl, base]);

    const onAnother = useCallback(() => {
        setActed(true);
        setStage({ kind: 'choose' });
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
                        onAnother={onAnother}
                        onRemove={() => void onRemove()}
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
            onSearch={() => void onSearch()}
            onAnother={onAnother}
        />
    );
};
