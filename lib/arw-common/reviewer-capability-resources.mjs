import {lstat} from 'node:fs/promises';
import {join} from 'node:path';

import {createNodeGitRunner, runGitText} from '../common/git-process.mjs';
import {isJsonObject, parseJsonText} from '../common/json.mjs';

export const CAPABILITY_FIXTURES = 'tests/fixtures/reviewer-capability';
export const CAPABILITY_ORIGIN = 'lib/reviewer-capability/origin.json';
export const CAPABILITY_INSTRUCTIONS = [
    'docs/agents/reviewer.md', 'docs/agents/writing.md', 'docs/agents/specification-presentation.md',
    'docs/agents/repository-terminology.md', 'docs/agents/subagent-findings.md', 'docs/agents/roles',
    '.agents/skills/issue-tracking/SKILL.md', '.agents/skills/domain-modeling/SKILL.md',
];

/** @typedef {{commit: string, fixtureTree: string, treeDirty: boolean}} CapabilityOrigin */
/** @param {unknown} value @returns {value is CapabilityOrigin} */
export const isCapabilityOrigin = value => {
    const gitId = (/** @type {unknown} */ id) => typeof id === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(id);
    return isJsonObject(value) && Object.keys(value).length === 3
        && gitId(value.commit) && gitId(value.fixtureTree) && typeof value.treeDirty === 'boolean';
};

/** @param {Buffer} bytes */
export const parseCapabilityOrigin = bytes => {
    const parsed = parseJsonText(bytes);
    if (parsed.status !== 'succeeded' || !isCapabilityOrigin(parsed.value)) throw new Error('Invalid Reviewer capability origin.');
    return parsed.value;
};

/** @param {string} root @param {boolean} [includeUntracked] @returns {Promise<CapabilityOrigin | null>} */
export const readCapabilityCheckoutOrigin = async (root, includeUntracked = true) => {
    try { await lstat(join(root, '.git')); } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null;
        throw error;
    }
    const git = createNodeGitRunner(root);
    const [ids, status] = await Promise.all([
        runGitText(git, ['rev-parse', 'HEAD', `HEAD:${CAPABILITY_FIXTURES}`], 'Reviewer capability origin'),
        runGitText(git, ['--no-optional-locks', 'status', '--porcelain', includeUntracked ? '--untracked-files=all' : '--untracked-files=no'],
            'Reviewer capability origin'),
    ]);
    const [commit, fixtureTree] = ids.trim().split('\n');
    return {commit, fixtureTree, treeDirty: status !== ''};
};
