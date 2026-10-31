/**
 * Every value the package exports. A type export is erased from the build,
 * so it is not here. The engine's tests compare this with the source's
 * exports, so a new export cannot ship without the smoke test seeing it.
 */
export const VALUE_EXPORTS = [
    'EngineError',
    'SIGNAL_CAP',
    'SIGNAL_SATURATION',
    'createEngine',
    'foldAccents',
    'normalize',
    'signalWeight',
    'stem',
    'tokenize',
    'withinEdits',
    'withinOneEdit',
];
