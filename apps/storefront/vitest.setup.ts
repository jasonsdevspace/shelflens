import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});

// The test document does not scroll, and some tests have no document at all. The
// search box scrolls its highlighted option into view, so the document is given a way.
if (typeof Element !== 'undefined' && !('scrollIntoView' in Element.prototype)) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
        value: () => undefined,
        writable: true,
    });
}
