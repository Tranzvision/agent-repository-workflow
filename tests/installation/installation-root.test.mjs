import assert from 'node:assert/strict';
import {cp, readdir} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

import {runExitedProcess} from '../helpers/process.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {ARW_VERSION} from '../../lib/arw-common/identity.mjs';

// The root Installer process tests live in their own file so they run in parallel with the in-process Installer cases.
const SOURCE_DIRECTORY = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const createHome = (/** @type {test.TestContext} */ t) => createTemporaryDirectory(t, 'agent-repository-workflow-home-');

const copyLocalCheckout = async (/** @type {Parameters<typeof createTemporaryDirectory>[0]} */ t, paths = ['install.mjs', 'lib']) => {
    const checkout = await createTemporaryDirectory(t, 'agent-repository-workflow-local-checkout-');
    await Promise.all(paths.map(path => cp(join(SOURCE_DIRECTORY, path), join(checkout, path), {recursive: true})));
    return checkout;
};

test('root Installer rejects invalid arguments before runtime identity observation', async t => {
    const checkout = await copyLocalCheckout(t);

    const result = await runExitedProcess('node', [join(checkout, 'install.mjs'), '--release-tag', `${ARW_VERSION}-pre`]);
    assert.equal(result.exitCode, 2);
    assert.match(result.stderr, /stable MAJOR\.MINOR\.PATCH/);
    assert.doesNotMatch(result.stderr, /Runtime identity authority/);
});

const runRootInstaller = (/** @type {string} */ home, /** @type {string} */ input) => runExitedProcess('node', [join(SOURCE_DIRECTORY, 'install.mjs')], {
    env: {...process.env, CODEX_HOME: '', HOME: home, USERPROFILE: home},
    input,
    timeout: 10_000,
});

// The boundary under test is a real root Installer process, so process start alone exceeds 100 ms.
test('root Installer maps prompt EOF to one stable pre-write error', async t => {
    const home = await createHome(t);
    const result = await runRootInstaller(home, '');

    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /Interactive input ended before a decision was provided\.\n$/);
    assert.deepEqual(await readdir(home), []);
});

// The boundary under test is a real root Installer process, so process start alone exceeds 100 ms.
test('root Installer completes from a single piped answer line', async t => {
    const home = await createHome(t);
    const result = await runRootInstaller(home, 'n\n');

    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
    await readdir(join(home, '.agent-repository-workflow', 'lib'));
    assert.equal((await readdir(home)).includes('.profile'), false);
});
