// Second layer of the report reader (capability scoring only): a report the reader rejects for its notation, though it holds content, becomes a
// `format` candidate. A blind judge says whether every line has one reading and rewrites the lines; the program takes a rewrite only when it
// changes nothing but format symbols, and the reader must then accept the result. Anything else keeps the rejection.

import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

import {sha256} from '../common/json.mjs';
import {FixtureError} from './scenario.mjs';

export const FORMAT_JUDGE_DIR = join(fileURLToPath(new URL('../..', import.meta.url)), 'tests', 'fixtures', 'reviewer-capability', 'format-judge');
const GRAMMAR = {
    'jsonl-rows': 'Each line is one JSON object; keys and values stay as written, no field is added or removed.',
    'spec-readiness-items': 'One item per line: `- <CHECK>, gap|uncertain: <text>` (CHECK is capital letters and hyphens), indented continuation lines allowed; the whole report may instead be `No problems.`',
    'finding-bullets': 'Each finding starts with `- ` or `1. ` at the line start, continuation lines are indented; the whole report may instead be `No problems.`',
};
// What a rewrite may add, remove or swap: markup and separators, never a letter, digit, path character or the order of the rest.
const MARKUP = /[`*_()[\]{}<>"'|#]/gu;
/** The line as its non-empty fragments (split at markup and separators) with the separator text, markup removed, between each two. */
const pieces = (/** @type {string} */ line) => {
    /** @type {string[]} */ const tokens = [];
    /** @type {string[]} */ const gaps = [];
    line.split(/([\s`*_()[\]{}<>"'|#:;,•–—-]+)/u).forEach((part, index) => {
        if (index % 2 === 0) { if (part !== '') tokens.push(part); } else if (tokens.length > 0) gaps[tokens.length - 1] = (gaps[tokens.length - 1] ?? '') + part.replace(MARKUP, '');
    });
    return {gaps, tokens};
};
const sameWords = (/** @type {string} */ from, /** @type {string} */ to) => {
    const a = pieces(from);
    const b = pieces(to);
    if (a.tokens.length !== b.tokens.length || a.tokens.some((token, i) => token !== b.tokens[i])) return false;
    // A separator touching a number (`12-14`, `12, 14`, `12 14`) is part of what the number says: it stays as it was.
    return a.tokens.every((token, i) => i === a.tokens.length - 1 || !(/^\d+$/u.test(token) || /^\d+$/u.test(a.tokens[i + 1])) || (a.gaps[i] ?? '') === (b.gaps[i] ?? ''));
};
const parseRow = (/** @type {string} */ line) => { try { return JSON.stringify(JSON.parse(line)); } catch { return undefined; } };
/** A JSONL row may only lose its wrapper: the rewrite must parse, to the same value as the row (itself or its unwrapped form). */
const sameRow = (/** @type {string} */ from, /** @type {string} */ to) => {
    const value = parseRow(to);
    return value !== undefined && (value === parseRow(from) || value === parseRow(from.trim().replace(/^`+|`+$/gu, '').trim()));
};

/**
 * The format candidate of a rejected report, or undefined when the report is empty or the review did not deliver.
 * @param {{completion: any, extension: string, instanceId: string, role: string, text: string}} input
 */
export const formatCandidate = ({completion, extension, instanceId, role, text}) => {
    if (text.trim() === '' || completion?.status === 'incomplete') return undefined;
    const check = extension === '.jsonl' ? 'jsonl-rows' : role === 'spec-readiness-reviewer' ? 'spec-readiness-items' : 'finding-bullets';
    return {allowedDecisions: ['format-accept', 'format-reject'], candidateId: `${instanceId}/format`, check, evidence: [], expectation: null,
        finding: text.split('\n').map((line, index) => `${index + 1}| ${line}`).join('\n'), kind: 'format', result: GRAMMAR[check]};
};

/**
 * The report with the judge's line rewrites applied, and how many lines changed (one format error each); undefined when any rewrite is not
 * a symbol-only rewrite of a whole line, or no line changes.
 * @param {string} text @param {unknown} rewrites @param {{json?: boolean}} [options] @returns {{errors: number, text: string} | undefined}
 */
export const adoptLines = (text, rewrites, {json = false} = {}) => {
    if (!Array.isArray(rewrites)) return undefined;
    const lines = text.split('\n');
    const seen = new Set();
    let errors = 0;
    for (const entry of rewrites) {
        const {line, text: to} = entry ?? {};
        if (!Number.isInteger(line) || line < 1 || line > lines.length || seen.has(line) || typeof to !== 'string' || to.includes('\n') || !(json ? sameRow : sameWords)(lines[line - 1], to)) return undefined;
        seen.add(line);
        if (to !== lines[line - 1]) {
            lines[line - 1] = to;
            errors += 1;
        }
    }
    return errors === 0 ? undefined : {errors, text: lines.join('\n')};
};

/** The fixture of format pools: the judge's brief (hashed into every stored decision) and the synthetic controls; there are no anchors. */
export const loadFormatJudge = async (/** @type {string} */ directory) => {
    const read = (/** @type {string} */ name) => readFile(join(directory, name), 'utf8').catch(() => { throw new FixtureError(`${join(directory, name)} is missing: format pools take the format-judge fixture directory.`); });
    const [brief, controls] = await Promise.all([read('brief.md'), read('controls.json')]);
    return {anchors: {anchors: [], synthetic: JSON.parse(controls)}, anchorsSha256: sha256(controls), brief, name: 'format-judge', role: 'format-judge'};
};

export const formatBriefSha256 = async () => sha256((await loadFormatJudge(FORMAT_JUDGE_DIR)).brief);
