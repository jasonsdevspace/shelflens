import { quietTourOnStoreLinks } from './about/quiet-tour.js';

/**
 * The explainer page. Its stylesheet is linked from the page itself, so
 * the build shares no module between the explainer and the store and the
 * store's page stays one file. The one thing the page needs of its own is
 * to keep the tour from opening over the thing a reader was sent into the
 * store to see.
 */
quietTourOnStoreLinks(document, window.location);
