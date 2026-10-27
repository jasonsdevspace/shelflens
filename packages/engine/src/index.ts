export { withinOneEdit } from './edits.js';
export { foldAccents, normalize, stem, tokenize } from './normalize.js';
export { createEngine, type Engine } from './search.js';
export {
    type AttributeKind,
    type AttributeValue,
    type Document,
    type EngineConfig,
    EngineError,
    type Filter,
    type Hit,
    type MatchKind,
    type MatchMode,
    type RangeBucket,
    type Rule,
    type RuleAdjustment,
    type RuleEffect,
    type RuleTrigger,
    type SearchRequest,
    type SearchResult,
    type SortClause,
    type SynonymRule,
    type TermMatch,
    type TextField,
    type ValueBucket,
} from './types.js';
