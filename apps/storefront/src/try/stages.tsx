import { Button } from '@jasonsdevspace/design-kit/react';
import { type ChangeEvent, useState } from 'react';

import { useHeadingFocus } from '../app/focus.js';
import { LiveStatus } from '../app/LiveStatus.jsx';
import { PageTop } from '../app/PageTop.jsx';
import { Footer } from '../app/Portfolio.jsx';
import { Preparing } from '../app/Preparing.jsx';
import { StartFailure } from '../app/StartFailure.jsx';
import type { Loaded } from '../client/catalog.js';
import { count } from '../format/count.js';
import { DEFAULT_LOCALE } from '../format/locale.js';
import type { StartFailureKind } from '../worker/register.js';
import type { Table } from './csv.js';
import { CATALOG_ROW_CAP } from './limits.js';
import type { Mapping } from './mapping.js';
import { MappingEditor, Preview } from './MappingEditor.jsx';
import { Ask, ProblemAlert } from './notices.jsx';
import type { FileLike } from './read-file.js';
import { SAMPLE_FILE } from './sample.js';
import type { LoadResult, RowNote } from './to-catalog.js';
import { BACK_LABEL, SAMPLE_BUTTON, searchLabel } from './words.js';

/** Where the page is, from starting the store to searching the visitor's products. */
export type Stage =
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
          /** What the last change said of a column it moved, said with the preview that follows. */
          readonly note?: string;
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
          /** When the problem happened, so a second failure in the same words is heard again. */
          readonly problemAt?: number;
          /** Asked first, since removing the products discards the visitor's saved rules. */
          readonly confirm?: boolean;
          /** Set when focus goes back to the remove button, after a kept or failed removal. */
          readonly focusRemove?: boolean;
          /** Said once another tab replaced the products, so the change is not silent. */
          readonly notice?: string;
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
                here with suggestions, filters, sorting and a reason for every result. It takes up
                to {count(CATALOG_ROW_CAP, 'product', 'products', DEFAULT_LOCALE)}.
            </p>
            <p className="try-private">
                Your file is read in this page and kept in this browser. Nothing is uploaded, and
                clearing this site&rsquo;s data removes it.
            </p>
            <ProblemAlert problem={problem} />
            <p className="notice" role="status">
                {reading ? `Reading ${reading}.` : ''}
            </p>
            {notice !== undefined && (
                <>
                    <p className="notice">{notice}</p>
                    <LiveStatus text={notice} />
                </>
            )}
            {back === true && (
                <p>
                    <Button onClick={onBack}>{BACK_LABEL}</Button>
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
                <label className="dk-button dk-button-accent button-large try-pick">
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
    note,
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
    readonly note?: string | undefined;
    readonly problem?: string | undefined;
    readonly replacing?: boolean | undefined;
    readonly onSearch: () => void;
    readonly onAnother: () => void;
    readonly onMapping: (mapping: Mapping, note?: string) => void;
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
            {/* One alert, so a problem and a mapping that cannot make a catalog are heard together,
            directly under the heading that takes focus. */}
            <ProblemAlert
                problem={
                    [problem, result.ok ? undefined : result.error]
                        .filter((line) => line !== undefined)
                        .join(' ') || undefined
                }
            />
            {/* The answer first, then the way on, then the guess, so a right guess needs no scrolling
            and a wrong one is put right just below. */}
            {result.ok ? (
                <>
                    <Preview catalog={result.catalog} note={note} />
                    {/* In the page throughout, so each check of the whole file is heard. */}
                    <p className="notice" role="status">
                        {partial
                            ? `Checking all ${count(table.rows.length, 'row', 'rows', DEFAULT_LOCALE)}.`
                            : ''}
                    </p>
                    {partial ? null : (
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
                            <Button accent className="button-large" onClick={onSearch}>
                                {partial
                                    ? 'Search these products'
                                    : searchLabel(result.catalog.products.length)}
                            </Button>
                            <OtherWays back={back} onAnother={onAnother} onBack={onKeepProducts} />
                        </div>
                    )}
                </>
            ) : (
                <div className="try-actions">
                    <OtherWays back={back} onAnother={onAnother} onBack={onKeepProducts} />
                </div>
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
        <Button onClick={onAnother}>Choose another file</Button>
        {back === true && <Button onClick={onBack}>{BACK_LABEL}</Button>}
    </>
);

/** Everything before a store is built: starting, choosing, reviewing and loading. */
export const BeforeStore = ({
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
    readonly onMapping: (mapping: Mapping, note?: string) => void;
    readonly onReplace: () => void;
    readonly onKeepProducts: () => void;
}) => (
    <>
        <PageTop home="../" />
        <main className="content try">
            {stage.kind === 'starting' && <Preparing />}
            {stage.kind === 'loading' && <Building products={stage.products} announce={announce} />}
            {stage.kind === 'failed' && (
                <>
                    <StartFailure kind={stage.failure} />
                    {import.meta.env.DEV && <p className="notice">{stage.message}</p>}
                </>
            )}
            {/* One chooser for choosing and reading, so its status stays in the page and
                "Reading" is heard. */}
            {(stage.kind === 'choose' || stage.kind === 'reading') && (
                <Chooser
                    announce={announce}
                    reading={stage.kind === 'reading' ? stage.name : undefined}
                    problem={stage.kind === 'choose' ? stage.problem : undefined}
                    notice={stage.kind === 'choose' ? stage.notice : undefined}
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
                    note={stage.note}
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
        {stage.kind !== 'starting' && <Footer />}
    </>
);
