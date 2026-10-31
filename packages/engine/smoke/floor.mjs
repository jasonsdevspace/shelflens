/**
 * The lowest Node an engines range admits, down to the patch.
 *
 * The floor job installs exactly this version. Asking setup-node for the
 * range itself would install the newest Node it admits, which is the
 * opposite of a floor. Only the forms a published package here writes are
 * understood, `>=N`, `>=N.M` and `>=N.M.P`, and anything else gives back
 * nothing, so the job fails rather than test a guess.
 *
 * @param {string} range
 * @returns {string | undefined}
 */
export const floorOf = (range) => {
    const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(range.trim());
    if (match === null) return undefined;
    return [match[1], match[2] ?? '0', match[3] ?? '0'].join('.');
};
