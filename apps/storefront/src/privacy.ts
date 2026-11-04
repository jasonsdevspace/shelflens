/**
 * Whether the visitor allows being counted, which they do unless the browser
 * sends Global Privacy Control. The store's events and the site's visit
 * counts both ask this, so a visitor who sent the signal is in neither.
 */
export const trackingAllowed = (): boolean =>
    typeof navigator === 'undefined' ||
    !('globalPrivacyControl' in navigator && navigator.globalPrivacyControl === true);
