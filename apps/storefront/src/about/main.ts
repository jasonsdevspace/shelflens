import { quietTourOnStoreLinks } from './quiet-tour.js';

/**
 * The explainer page. Its style sheets are linked from the page itself, so
 * the build shares no module between the explainer and the store and the
 * store's page stays one file. The one thing the page needs of its own is
 * to keep the tour from opening over the thing a reader was sent into the
 * store to see.
 */
quietTourOnStoreLinks(document, window.location);
