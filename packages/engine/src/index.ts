export { withinEdits, withinOneEdit } from './edits.js';
export { foldAccents, normalize, stem, tokenize } from './normalize.js';
export { createEngine, type Engine } from './search.js';
export { SIGNAL_CAP, SIGNAL_SATURATION, signalWeight } from './signals.js';
export {
    type AttributeKind,
    type AttributeValue,
    type Document,
    type EngineConfig,
    EngineError,
    type EngineErrorCode,
    type Facet,
    type FacetConfig,
    type Filter,
    type Hit,
    type MatchKind,
    type MatchMode,
    type RangeBucket,
    type Recovery,
    type Rule,
    type RuleAdjustment,
    type RuleEffect,
    type RuleTrigger,
    type SearchRequest,
    type SearchResult,
    type SetAside,
    type SignalEffect,
    type SortClause,
    type SynonymRule,
    type TermMatch,
    type TextField,
    type ValueBucket,
} from './types.js';
