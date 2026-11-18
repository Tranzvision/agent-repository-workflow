import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

import {blocked, failed, isFinalScore} from './results.mjs';

/** Reads all instances atomically for publication; local rescoring paths never leave this boundary.
 * @param {{instances: string[]}} input
 */
export const exportInstances = async ({instances}) => {
    if (instances.length === 0) return blocked('At least one instance is required.');
    const records = [];
    const ids = new Set();
    try {
        for (const directory of instances) {
            const {report: _report, repair: _repair, ...record} = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
            if (ids.has(record.id)) return blocked(`Duplicate instance id: ${record.id}.`);
            ids.add(record.id);
            let scoring = null;
            let pauses = {known: false, count: null};
            if (record.validity.valid) {
                const output = JSON.parse(await readFile(join(directory, 'score.json'), 'utf8'));
                if (!isFinalScore(output)) return blocked(`Score output is not final: ${directory}.`);
                const scores = output.scores;
                scoring = {status: scores.modelFailure !== undefined ? 'modelFailure' : 'final', score: scores.final,
                    rawScore: scores.rawScore, scoreBeforePenalty: scores.scoreBeforePenalty, formatPenalty: scores.f,
                    overallDeduction: scores.overallDeduction, repairs: scores.rRepairable};
                pauses = {known: true, count: scores.pauseCount};
            }
            records.push({...record, scoring, pauses});
        }
        return {status: 'succeeded', schemaVersion: 1, instances: records};
    } catch (error) {
        return error instanceof SyntaxError || /** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT'
            ? blocked(`Instance data is missing or not JSON: ${error instanceof Error ? error.message : error}`) : failed('report-read', error);
    }
};
