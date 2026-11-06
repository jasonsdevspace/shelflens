import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { App } from '../App.jsx';
import { changeCatalog, type Loaded, readLoaded } from '../client/catalog.js';
import { readRules } from '../client/rules.js';
import { count } from '../format/count.js';
import { DEFAULT_LOCALE } from '../format/locale.js';
import { startFailure } from '../worker/register.js';
import { CatalogBar } from './CatalogBar.jsx';
import type { Table } from './csv.js';
import { guessMapping, type Mapping } from './mapping.js';
import { type FileLike, readFile } from './read-file.js';
import { SAMPLE_FILE } from './sample.js';
import { BeforeStore, type Stage } from './stages.jsx';
import { toCatalog } from './to-catalog.js';
import { useOtherTab } from './useOtherTab.js';
import { errorOf, GONE, SAMPLE_BUTTON, searchLabel } from './words.js';

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

/** Files up to this many rows are made again on every change, which takes a moment. */
const QUICK_ROWS = 1000;
/** How long a pause in the changes before a larger file is made again whole. */
const CATCH_UP_MS = 300;

/**
 * Whether loading a catalog of this version would discard rules the visitor
 * saved, as the worker decides it: there are saved rules, and the products
 * loaded, if any, are not these. The same file again keeps its rules. Read
 * before the store is built, so the page can ask first, and an answer that
 * cannot be read asks nothing, since the worker refuses on its own.
 */
const wouldDiscardRules = async (
    base: string,
    catalogUrl: string,
    version: string
): Promise<boolean> => {
    try {
        const [saved, loaded] = await Promise.all([
            readRules(`${base}rules`),
            readLoaded(catalogUrl),
        ]);
        return saved?.edited === true && saved.rules.length > 0 && loaded?.version !== version;
    } catch {
        return false;
    }
};

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
    const choice = useRef(0);
    // Set while a load or a removal is with the worker, so a second press waits.
    const pending = useRef(false);
    // The search the visitor left when they chose another file.
    const lastSearch = useRef('');
    // Set while products are loaded and the visitor looks at another file, so they can go back.
    const [back, setBack] = useState(false);
    const catalogUrl = `${base}catalog`;
    // Ends a change with the worker. The next stage is drawn before the guard is let go. Otherwise a
    // quick second press lands on the old button, whose handler still sees the stage before, and
    // repeats the change.
    const release = (draw: (() => void) | undefined) => {
        try {
            if (draw) flushSync(draw);
        } finally {
            pending.current = false;
        }
    };

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
        choice.current += 1;
        const mine = choice.current;
        setStage({ kind: 'reading', name: file.name });
        try {
            const table = await readFile(file);
            const mapping = guessMapping(table);
            const result = toCatalog(table, mapping);
            if (mine === choice.current) {
                setStage({ kind: 'review', name: file.name, table, mapping, result });
            }
        } catch (error) {
            if (mine === choice.current) setStage({ kind: 'choose', problem: messageOf(error) });
        }
    }, []);

    const searching = stage.kind === 'searching' ? stage.loaded.version : undefined;
    const otherTab = (loaded: Loaded | undefined) => {
        clearSearch(base);
        setStage(
            loaded
                ? {
                      kind: 'searching',
                      loaded,
                      notice: `Another tab loaded ${count(loaded.products, 'product', 'products', DEFAULT_LOCALE)}, so these are what you are searching now.`,
                  }
                : {
                      kind: 'choose',
                      notice: 'Your products were removed from this browser in another tab.',
                  }
        );
    };
    useOtherTab({ searching, catalogUrl, pending, onChange: otherTab });

    // A file dropped anywhere on the page is read wherever a file can be taken, and is never
    // opened by the browser in the page's place, which would lose whatever the visitor had. The
    // listeners start in the same commit as the chooser, so a file dropped the moment it appears
    // is read rather than opened.
    const takesFile =
        stage.kind === 'choose' || stage.kind === 'reading' || stage.kind === 'review';
    useLayoutEffect(() => {
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

    const onSample = async () => {
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
                problem: `The sample could not be loaded (${messageOf(error)}). Press \u201c${SAMPLE_BUTTON}\u201d again, or download the sample and choose it as a file.`,
            });
        }
    };

    // Loading a file replaces the products being searched, and the worker
    // refuses to when that would discard the visitor's saved rules, so the
    // page asks then and loads again once the visitor agrees.
    const load = async (discardRules: boolean) => {
        if (stage.kind !== 'review' || pending.current) return;
        const { replacing: _replacing, ...current } = stage;
        const whole = current.partial ? toCatalog(current.table, current.mapping) : current.result;
        const review = { ...current, result: whole, partial: false };
        if (!whole.ok) {
            setStage(review);
            return;
        }
        const { catalog } = whole;
        const retry = searchLabel(catalog.products.length);
        pending.current = true;
        choice.current += 1;
        const mine = choice.current;
        const { problem: _last, ...asking } = review;
        let next: Stage | undefined;
        try {
            // Asked before the store is built, so the page never says it is building and then
            // asks. The worker still refuses on its own, in case the rules changed meanwhile.
            const ask =
                !discardRules && (await wouldDiscardRules(base, catalogUrl, catalog.version));
            // A file chosen or dropped while the rules were read is the visitor's latest choice.
            if (mine !== choice.current) return;
            if (ask) {
                next = { ...asking, replacing: true };
                return;
            }
            setStage({ kind: 'loading', products: catalog.products.length });
            // Preparing a large file for the worker holds the page, so the stage shows first.
            await nextPaint();
            const response = await changeCatalog(
                catalogUrl,
                { method: 'PUT', body: JSON.stringify(catalog) },
                discardRules
            );
            if (response === 'refused') {
                next = { ...asking, replacing: true };
                return;
            }
            if (!response.ok) {
                next = { ...review, problem: await errorOf(response, retry) };
                return;
            }
            // The products the visitor could have gone back to are replaced now.
            setBack(false);
            const loaded = await readLoaded(catalogUrl);
            clearSearch(base);
            next = loaded
                ? { kind: 'searching', loaded, arrival: performance.now() }
                : {
                      ...review,
                      problem: `The store did not keep your products. Press \u201c${retry}\u201d to try again.`,
                  };
        } catch (error) {
            next = {
                ...review,
                problem: `The store could not be reached (${messageOf(error)}). Press \u201c${retry}\u201d to try again.`,
            };
        } finally {
            const last = next;
            release(last && (() => setStage(last)));
        }
    };

    // Back to the products the visitor was searching, with their search, from the chooser or
    // from a file they looked at instead. Pressing it is the visitor's latest choice, so a file
    // still being read is let go, and a file chosen while the products are read wins over it.
    const keepProducts = async () => {
        if (stage.kind !== 'choose' && stage.kind !== 'reading' && stage.kind !== 'review') return;
        if (pending.current) return;
        const from = stage;
        choice.current += 1;
        const mine = choice.current;
        pending.current = true;
        let next: Stage | undefined;
        // The way back goes once the products are read, whether or not they are still there.
        let read = false;
        try {
            const loaded = await readLoaded(catalogUrl);
            if (mine !== choice.current) return;
            read = true;
            if (loaded) {
                window.history.replaceState(null, '', `${base}${lastSearch.current}`);
                next = { kind: 'searching', loaded };
            } else if (from.kind !== 'review') next = { kind: 'choose', problem: GONE };
            else if (from.replacing === true) {
                // Only the saved rules are left, and searching this file still discards them,
                // so the question stays.
                next = {
                    ...from,
                    problem:
                        'Your products are no longer in this browser, so there is nothing to keep. Press \u201cYes, search this file\u201d to search it.',
                };
            } else next = { ...from, problem: GONE };
        } catch (error) {
            if (mine !== choice.current) return;
            const problem = `Your products could not be read (${messageOf(error)}). Reload the page to get back to them.`;
            if (from.kind === 'review') {
                const { replacing: _replacing, ...rest } = from;
                next = { ...rest, problem };
            } else next = { kind: 'choose', problem };
        } finally {
            const last = next;
            release(
                last &&
                    (() => {
                        if (read) setBack(false);
                        setStage(last);
                    })
            );
        }
    };

    // Removing the products discards the visitor's saved rules, so the worker
    // refuses to unless the visitor agreed, and the page asks then.
    const onRemove = async (discardRules: boolean) => {
        if (stage.kind !== 'searching' || pending.current) return;
        const { loaded } = stage;
        pending.current = true;
        setActed(true);
        let next: Stage | undefined;
        try {
            const response = await changeCatalog(catalogUrl, { method: 'DELETE' }, discardRules);
            if (response === 'refused') {
                next = { kind: 'searching', loaded, confirm: true };
            } else {
                if (!response.ok) throw new Error(`error ${response.status}`);
                clearSearch(base);
                next = {
                    kind: 'choose',
                    notice: discardRules
                        ? 'Your products and the rules you saved for them were removed from this browser.'
                        : 'Your products were removed from this browser.',
                };
            }
        } catch (error) {
            next = {
                kind: 'searching',
                loaded,
                focusRemove: true,
                problemAt: performance.now(),
                problem: `Your products could not be removed (${messageOf(error)}), so they are still here. Press \u201cRemove your products\u201d to try again.`,
            };
        } finally {
            const last = next;
            release(last && (() => setStage(last)));
        }
    };

    // A changed mapping is a new catalog, made again from the rows already read. A small
    // file is made again at once. A large one shows its first rows at once and is made
    // again whole once the visitor pauses, so each change stays quick on a phone.
    const onMapping = (mapping: Mapping, note?: string) => {
        if (stage.kind !== 'review') return;
        const { problem: _last, note: _said, ...review } = stage;
        const quick = stage.table.rows.length <= QUICK_ROWS;
        const result = toCatalog(quick ? stage.table : firstRows(stage.table), mapping);
        setStage({ ...review, mapping, result, partial: !quick, ...(note && { note }) });
    };

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

    const onAnother = () => {
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
    };

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
                        problemAt={stage.problemAt}
                        notice={stage.notice}
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
