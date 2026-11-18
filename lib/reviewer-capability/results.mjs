export const blocked = (/** @type {string} */ message) => ({diagnostics: [message], status: 'blocked'});
export const failed = (/** @type {string} */ stage, /** @type {unknown} */ error) => ({diagnostics: [error instanceof Error ? error.message : String(error)], stage, status: 'failed'});
/** A score output is final when it succeeded, has no undecided candidates and is not provisional. */
export const isFinalScore = (/** @type {any} */ output) => output.status === 'succeeded' && Array.isArray(output.candidates)
    && output.candidates.length === 0 && (output.provisional ?? null) === null;
