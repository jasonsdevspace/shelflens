/**
 * Uses the engine the way someone who installed it from npm does, on the
 * lowest Node its engines field admits.
 *
 * CI packs the engine, installs the tarball into an empty project outside the
 * repository, copies this folder in beside it, and runs it on that Node. Only
 * plain Node is used, with no test runner, so it runs on any Node the package
 * could declare. Each assertion names what a user would lose if it failed.
 *
 * Run by the floor job in .github/workflows/ci.yml.
 */
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VALUE_EXPORTS } from './exports.mjs';

// The job's setup step can quietly install a newer Node than the one asked
// for, and then everything below proves nothing about the floor.
const floor = process.env.FLOOR;
assert.ok(floor, 'FLOOR names the Node this run is meant to be on');
assert.equal(process.version, `v${floor}`, 'runs on the lowest Node the package admits');

// The import resolves from the installed tarball, not from a workspace link
// back to the repository's own build.
const entry = import.meta.resolve('@jasonsdevspace/shelflens');
assert.match(
    entry,
    /\/node_modules\/@jasonsdevspace\/shelflens\/dist\/index\.js$/,
    'imports the installed package'
);

// What the tarball holds: the build and its types, and none of the tests,
// build records or this smoke test.
const installed = join(dirname(fileURLToPath(entry)), '..');
assert.ok(existsSync(join(installed, 'dist/index.d.ts')), 'ships the types beside the build');
const shipped = readdirSync(installed, { recursive: true }).map(String);
for (const unwanted of [/\.test\.ts$/, /\.tsbuildinfo$/, /^smoke/]) {
    assert.ok(!shipped.some((path) => unwanted.test(path)), `ships nothing matching ${unwanted}`);
}

const shelflens = await import('@jasonsdevspace/shelflens');
assert.deepEqual(
    Object.keys(shelflens).sort(),
    VALUE_EXPORTS,
    'exports every value the README describes'
);

const { createEngine, EngineError, withinOneEdit } = shelflens;

const documents = [
    {
        id: 'p1',
        text: { name: 'Trail running shoe', brand: 'Northwind' },
        attributes: { brand: 'Northwind', price: 9000 },
    },
    {
        id: 'p2',
        text: { name: 'Canvas sneaker', brand: 'Harbor' },
        attributes: { brand: 'Harbor', price: 4000 },
    },
    {
        id: 'p3',
        text: { name: 'Leather boot', brand: 'Northwind' },
        attributes: { brand: 'Northwind', price: 15000 },
    },
];

const engine = createEngine(documents, {
    fields: { name: { weight: 3 }, brand: { weight: 1 } },
    attributes: { brand: 'keyword', price: 'number' },
    synonyms: [{ kind: 'one-way', from: 'trainers', to: 'sneaker' }],
    facets: { brand: { kind: 'keyword', attribute: 'brand' } },
});

const ids = (result) => result.hits.map((hit) => hit.id);

const typo = engine.search({ query: 'snekaer' });
assert.deepEqual(ids(typo), ['p2'], 'finds a product through a typo');
assert.equal(typo.mode, 'fuzzy', 'says the query was corrected');
assert.equal(typo.hits[0].matches[0].kind, 'fuzzy', 'explains the match as a typo');

const synonym = engine.search({ query: 'trainers' });
assert.deepEqual(ids(synonym), ['p2'], 'finds a product through a synonym');
assert.equal(synonym.hits[0].matches[0].kind, 'synonym', 'explains the match as a synonym');

const filtered = engine.search({ filters: [{ attribute: 'brand', eq: 'Northwind' }] });
assert.deepEqual(ids(filtered).sort(), ['p1', 'p3'], 'filters by an attribute');
const brands = filtered.facets.find((facet) => facet.name === 'brand');
assert.deepEqual(
    Object.fromEntries(brands.buckets.map((bucket) => [bucket.value, bucket.count])),
    { Harbor: 1, Northwind: 2 },
    'counts a facet past its own filter, so the other brand stays choosable'
);

const cheap = engine.search({ filters: [{ attribute: 'price', range: { to: 10000 } }] });
assert.deepEqual(ids(cheap).sort(), ['p1', 'p2'], 'filters by a price range');

assert.throws(
    () => engine.search({ filters: [{ attribute: 'color', eq: 'red' }] }),
    (error) => error instanceof EngineError && error.code === 'unknown_attribute',
    'refuses a filter on an attribute it was not given, with its own error'
);
assert.equal(withinOneEdit('shoe', 'shoes'), true, 'compares words within one edit');

console.log(`The packed engine works on Node ${floor}.`);
