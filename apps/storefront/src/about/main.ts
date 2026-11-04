import { startAnalytics } from '../analytics.js';
import { quietTourOnStoreLinks } from './quiet-tour.js';

/**
 * The explainer page. Its style sheets are linked from the page itself, so
 * the only module the explainer and the store share is the visit counter, a
 * small file the browser keeps for both. The one thing the page needs of its
 * own is to keep the tour from opening over the thing a reader was sent into
 * the store to see.
 */
startAnalytics();
quietTourOnStoreLinks(document, window.location);
