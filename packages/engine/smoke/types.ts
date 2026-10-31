// Compiled in the same empty project as consumer.mjs, against the installed
// package, once as Node resolves it and once as a bundler does. It fails if
// the types do not ship, do not resolve, or have quietly become `any`.
import { createEngine, type EngineConfig, type SearchResult } from '@jasonsdevspace/shelflens';

const config: EngineConfig = { fields: { name: { weight: 1 } }, attributes: {} };
const result: SearchResult = createEngine([], config).search({ query: 'shoe' });
export const total: number = result.total;

// @ts-expect-error A total is a number, so the types are real rather than `any`.
export const wrong: string = result.total;
