/** Mechanical counts for Effect Log records. They never interpret an item or judge whether it is valid. */

const DISPOSITION_PHRASES = /** @type {const} */ ([['转入后续 issue', 'follow-up'], ['记录不修', 'not-fixed'], ['冲突裁决', 'arbitration']]);

/** Reviewer report items: lines starting with `- ` (no indent); `No problems.` has none. @param {string} text */
export const countFindings = text => text.split('\n').filter(line => line.startsWith('- ')).length;

/**
 * Disposition ledger lines (`台账:` after an optional `- `); the first phrase on the line decides the category and a
 * line with none of the three phrases is not counted.
 * @param {string[]} lines
 */
export const countDispositions = lines => {
    const counts = {'follow-up': 0, 'not-fixed': 0, arbitration: 0};
    for (const line of lines) {
        const ledger = line.startsWith('- ') ? line.slice(2) : line;
        if (!ledger.startsWith('台账:')) continue;
        const found = DISPOSITION_PHRASES.map(([phrase, category]) => ({category, index: ledger.indexOf(phrase)})).filter(({index}) => index >= 0);
        if (found.length > 0) counts[found.reduce((first, next) => next.index < first.index ? next : first).category]++;
    }
    return counts;
};
