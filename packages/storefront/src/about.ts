import './styles.css';

import { quietTourOnStoreLinks } from './about/quiet-tour.js';

/**
 * The explainer page. It shares the demo's stylesheet and needs one thing
 * of its own, which is to keep the tour from opening over the thing a
 * reader was sent into the store to see.
 */
quietTourOnStoreLinks(document, window.location);
