import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { browserFloor } from '@jasonsdevspace/design-kit/vite';
import { describe, expect, it } from 'vitest';

/*
 * The store's build takes its browser floor from the design kit, so a version of the kit that
 * raises the floor would raise the browsers the store runs in with nothing but a version changing.
 * This holds what the kit gives to the floor decision record 19 states, so a raised floor fails
 * here until the record says so.
 */

const RECORD = resolve('docs/decisions/0019-the-pages-are-drawn-from-the-design-kit.md');

/**
 * The floor record 19 states, each browser by its name in lower case and its version. A name with
 * no version of its own takes the next one, as in "Chrome and Edge 123".
 */
const stated = (text: string): string[] => {
    const sentence = /`browserFloor\(\)`, which is (.+?), for its script/s
        .exec(text)?.[1]
        ?.replaceAll(/\s+/g, ' ');
    if (sentence === undefined) throw new Error('record 19 states no browser floor');
    const floor: string[] = [];
    let waiting: string[] = [];
    for (const [, name = '', version] of sentence.matchAll(/([A-Z][a-z]+)(?: (\d+(?:\.\d+)?))?/g)) {
        waiting.push(name.toLowerCase());
        if (version === undefined) continue;
        floor.push(...waiting.map((each) => `${each}${version}`));
        waiting = [];
    }
    return floor;
};

describe("the store's browser floor", () => {
    it('is the floor the kit gives, and the floor decision record 19 states', () => {
        expect(browserFloor()).toEqual(stated(readFileSync(RECORD, 'utf8')));
    });
});
