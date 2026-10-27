export { createEngine, type Engine } from './search.js';
export { foldAccents, normalize, stem, tokenize } from './normalize.js';
export { withinOneEdit } from './edits.js';
export {
    EngineError,
    type AttributeKind,
    type AttributeValue,
    type Document,
    type EngineConfig,
    type Filter,
    type Hit,
    type MatchKind,
    type MatchMode,
    type SearchRequest,
    type SearchResult,
    type SortClause,
    type SynonymRule,
    type TermMatch,
    type TextField,
} from './types.js';
