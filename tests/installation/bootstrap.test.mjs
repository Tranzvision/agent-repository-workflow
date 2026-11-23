import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {access, copyFile, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test, {after} from 'node:test';

import {moduleSpecifiers, resolveSourceImport} from '../helpers/module-imports.mjs';
import {installFakeCommand, runExitedProcess, runSuccessfulProcess} from '../helpers/process.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';
import {ARW_VERSION} from '../../lib/arw-common/identity.mjs';
import {CAPABILITY_FIXTURES, CAPABILITY_ORIGIN} from '../../lib/arw-common/reviewer-capability-resources.mjs';
import {generateBootstrapArtifact} from '../../lib/installation/bootstrap-artifact.mjs';
import {BootstrapUsageError, runBootstrap} from '../../lib/installation/bootstrap.mjs';

const SOURCE_DIRECTORY = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

test('Bootstrap Artifact Module closes invalid input, mismatch, and write results', async t => {
    assert.deepEqual(await generateBootstrapArtifact({mode: 'check', sourceDirectory: 'relative'}), {
        diagnostics: [{
            code: 'bootstrap-artifact-input-invalid',
            message: 'Bootstrap Artifact requires sourceDirectory and write or check mode.',
        }],
        status: 'blocked',
    });

    const root = await createTemporaryDirectory(t, 'bootstrap-artifact-');
    for (const directory of ['lib/arw-common', 'lib/installation', 'scripts']) {
        await mkdir(join(root, directory), {recursive: true});
    }
    for (const path of [
        'lib/arw-common/runtime-compatibility.mjs',
        'lib/installation/bootstrap.mjs',
        'release-validation.json',
        'scripts/install-arw.mjs',
    ]) {
        await copyFile(join(SOURCE_DIRECTORY, path), join(root, path));
    }
    await writeFile(join(root, 'scripts', 'install-arw.mjs'), 'drift\n', 'utf8');

    const mismatch = await generateBootstrapArtifact({mode: 'check', sourceDirectory: root});
    assert.equal(mismatch.status, 'blocked');
    assert.equal(mismatch.diagnostics[0].code, 'bootstrap-artifact-mismatch');
    assert.deepEqual(await generateBootstrapArtifact({mode: 'write', sourceDirectory: root}), {
        changed: true,
        diagnostics: [],
        status: 'succeeded',
    });
    assert.deepEqual(await generateBootstrapArtifact({mode: 'check', sourceDirectory: root}), {
        changed: false,
        diagnostics: [],
        status: 'succeeded',
    });
});

test('scripts bootstrap artifact exposes the standalone CLI seam', async () => {
    const result = await runExitedProcess(process.execPath, [
        join(SOURCE_DIRECTORY, 'scripts', 'install-arw.mjs'),
        '--version',
        'v0.2.0',
    ]);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /stable MAJOR\.MINOR\.PATCH/);
});

const RELEASE_CONFIGURATION = {
    status: 'succeeded',
    value: {repositories: {sourceCheckout: {url: 'https://github.com/example/arw.git'}}},
};
/** @type {() => void | Promise<void>} */
let removeArchiveDirectory = () => {};
const ARCHIVE_DIRECTORY = await createTemporaryDirectory({after: cleanup => { removeArchiveDirectory = cleanup; }}, 'arw-bootstrap-archive-');
const ARCHIVE = join(ARCHIVE_DIRECTORY, 'arw.tar.gz');
// An `after` hook registered while the packing is pending could run before the tests below are registered, so it is registered once the packing succeeded.
try {
    await runSuccessfulProcess(process.execPath, [join(SOURCE_DIRECTORY, 'scripts', 'pack-release.mjs'), ARCHIVE]);
} catch (error) {
    await removeArchiveDirectory();
    throw error;
}
after(removeArchiveDirectory);
const ASSET_URL = (/** @type {string} */ tag) => `https://github.com/example/arw/releases/download/${tag}/arw.tar.gz`;

test('bootstrap with --version downloads that release asset, hands off the tag and cleans up', async () => {
    /** @type {string[]} */
    const downloads = [];
    /** @type {string[]} */
    const cleanup = [];
    /** @type {unknown[]} */
    const installers = [];
    const result = await runBootstrap(['--non-interactive', '--version', '0.2.0', '--register-path', 'false'], {
        createTemporaryDirectory: async () => '/tmp/arw-release',
        download: async url => { downloads.push(url); return Buffer.from('archive'); },
        extractArchive: async (bytes, directory) => assert.deepEqual([bytes.toString(), directory], ['archive', '/tmp/arw-release']),
        launchInstaller: async input => { installers.push(input); return 7; },
        loadReleaseConfiguration: async () => RELEASE_CONFIGURATION,
        removeTemporaryDirectory: async directory => cleanup.push(directory),
        runtimeVersion: '24.0.0',
    });

    assert.equal(result, 7);
    assert.deepEqual(downloads, [ASSET_URL('0.2.0')]);
    assert.deepEqual(installers, [{
        arguments: ['--non-interactive', '--register-path', 'false'],
        directory: '/tmp/arw-release',
        tag: '0.2.0',
    }]);
    assert.deepEqual(cleanup, ['/tmp/arw-release']);
});

test('bootstrap without --version resolves the latest release tag from the GitHub API', async () => {
    /** @type {string[]} */
    const downloads = [];
    /** @type {string[]} */
    const tags = [];
    await runBootstrap([], {
        createTemporaryDirectory: async () => '/tmp/arw-release',
        download: async url => { downloads.push(url); return Buffer.from('{"tag_name":"1.4.0"}'); },
        extractArchive: async () => {},
        launchInstaller: async input => { tags.push(input.tag); return 0; },
        loadReleaseConfiguration: async () => RELEASE_CONFIGURATION,
        removeTemporaryDirectory: async () => {},
        runtimeVersion: '24.0.0',
    });

    assert.deepEqual(downloads, ['https://api.github.com/repos/example/arw/releases/latest', ASSET_URL('1.4.0')]);
    assert.deepEqual(tags, ['1.4.0']);
});

test('bootstrap rejects bad arguments and remotes before temporary or network work', async () => {
    const fail = async () => assert.fail('must not run');
    const dependencies = {createTemporaryDirectory: fail, download: fail, runtimeVersion: '24.0.0'};
    for (const args of [['--version', 'v1.0.0'], ['--version', '1.0.0', '--version', '1.0.1'], ['--version']]) {
        await assert.rejects(
            runBootstrap(args, {...dependencies, loadReleaseConfiguration: async () => RELEASE_CONFIGURATION}),
            error => error instanceof BootstrapUsageError,
        );
    }
    await assert.rejects(runBootstrap([], {
        ...dependencies,
        loadReleaseConfiguration: async () => ({status: 'succeeded', value: {repositories: {sourceCheckout: {url: 'https://example.invalid/team/arw.git'}}}}),
    }), /canonical GitHub HTTPS remote/);
});

test('bootstrap cleans up and fails when download or extraction fails', async () => {
    for (const failure of ['download', 'extract']) {
        /** @type {string[]} */
        const cleanup = [];
        await assert.rejects(runBootstrap(['--version', '0.2.0'], {
            createTemporaryDirectory: async () => '/tmp/arw-release',
            download: async () => { if (failure === 'download') throw new Error('HTTP 404'); return Buffer.alloc(0); },
            extractArchive: async () => { throw new Error('bad archive'); },
            launchInstaller: async () => assert.fail('must not launch'),
            loadReleaseConfiguration: async () => RELEASE_CONFIGURATION,
            removeTemporaryDirectory: async directory => cleanup.push(directory),
            runtimeVersion: '24.0.0',
        }), /HTTP 404|bad archive/);
        assert.deepEqual(cleanup, ['/tmp/arw-release']);
    }
});

test('bootstrap reports a corrupt archive as one line', async () => {
    await assert.rejects(runBootstrap(['--version', '0.2.0'], {
        download: async () => Buffer.from('not an archive'),
        launchInstaller: async () => assert.fail('must not launch'),
        loadReleaseConfiguration: async () => RELEASE_CONFIGURATION,
        runtimeVersion: '24.0.0',
    }), error => error instanceof Error && /^Archive extraction failed: [^\n]+$/u.test(error.message));
});

test('bootstrap extracts the real release archive without Git and the Installer import closure is complete', async () => {
    /** @type {string[]} */
    const directories = [];
    const closure = ['install.mjs'];

    const result = await runBootstrap(['--version', '0.2.0'], {
        download: async () => readFile(ARCHIVE),
        launchInstaller: async ({directory}) => {
            directories.push(directory);
            await Promise.all(['lib', 'distribution', 'package.json', CAPABILITY_FIXTURES, CAPABILITY_ORIGIN].map(entry => access(join(directory, entry))));
            await assert.rejects(access(join(directory, '.git')));
            assert.deepEqual(await readdir(join(directory, 'tests')), ['fixtures']);
            for (const file of closure) {
                for (const specifier of moduleSpecifiers(await readFile(join(directory, file), 'utf8')).filter(name => name.startsWith('.'))) {
                    const imported = resolveSourceImport(file, specifier);
                    await access(join(directory, imported));
                    if (!closure.includes(imported)) closure.push(imported);
                }
            }
            return 0;
        },
        loadReleaseConfiguration: async () => RELEASE_CONFIGURATION,
        runtimeVersion: '24.0.0',
    });

    assert.equal(result, 0);
    await assert.rejects(access(directories[0]));
});

test('the released installation runs all four Reviewer scenarios independently using a fake provider', {skip: process.platform === 'win32'}, async t => {
    // Exercise the shipped archive, actual Installer and CLI, Git fixture construction and the existing scoring command.
    const cwd = await createTemporaryDirectory(t, 'arw-installed-capability-');
    const home = join(cwd, 'home');
    const unpacked = join(cwd, 'release');
    await Promise.all([mkdir(home), mkdir(unpacked)]);
    const env = {...process.env, HOME: home, USERPROFILE: home, CODEX_HOME: ''};
    await runSuccessfulProcess('tar', ['-xzf', ARCHIVE, '-C', unpacked], {cwd, env});
    const origin = JSON.parse(await readFile(join(unpacked, CAPABILITY_ORIGIN), 'utf8'));
    await runSuccessfulProcess(process.execPath, [join(unpacked, 'install.mjs'), '--non-interactive', '--register-path', 'false',
        '--reinitialize-config', 'false', '--release-tag', ARW_VERSION], {cwd, env});
    const installation = join(home, '.agent-repository-workflow');
    await assert.rejects(access(join(installation, '.git')), {code: 'ENOENT'});
    const installedVersion = (await runSuccessfulProcess(process.execPath, [join(installation, 'arw.mjs'), '--version'], {cwd, env})).stdout.trim();
    const calls = join(cwd, 'calls');
    await writeFile(join(cwd, 'fake.mjs'), [
        "import {appendFileSync, readFileSync, writeFileSync} from 'node:fs';",
        'const {CALLS, RB_REPORT_PATH, RB_PROMPT_FILE, RB_SCENARIO, RB_CWD} = process.env;',
        'if (process.cwd() !== RB_CWD) process.exit(90);',
        "const prompt = readFileSync(RB_PROMPT_FILE, 'utf8');",
        "appendFileSync(CALLS, RB_SCENARIO + '\\n');",
        "if (prompt.includes('single word OK')) process.stdout.write('OK');",
        "else if (prompt.includes(RB_REPORT_PATH)) writeFileSync(RB_REPORT_PATH, 'No problems.');",
        'else process.exit(91);',
    ].join('\n'));
    const config = {provider: 'fake', command: [process.execPath, join(cwd, 'fake.mjs'), '{prompt_file}'],
        version_command: [process.execPath, '-e', 'console.log("fake 1")'], env: {CALLS: calls}};
    // The run records its calls in a separate file, so it can overlap the probe commands below.
    const runCalls = join(cwd, 'run-calls');
    await writeFile(join(cwd, 'model.json'), JSON.stringify(config));
    await writeFile(join(cwd, 'run-model.json'), JSON.stringify({...config, env: {CALLS: runCalls}}));
    const cli = (/** @type {string} */ operation, /** @type {string[]} */ args) => runSuccessfulProcess(process.execPath,
        [join(installation, 'arw.mjs'), 'reviewer-capability', operation, ...args], {cwd, env});
    const args = ['--config', 'model.json', '--model', 'fake', '--efforts', 'high', '--n', '1', '--out', 'results'];
    const running = cli('run', ['--config', 'run-model.json', ...args.slice(2)]);
    const [check, plan] = await Promise.all([cli('check', args), cli('plan', args)]);
    assert.equal(check.stdout.match(/: succeeded/gu)?.length, 4);
    assert.match(plan.stdout, /4 model calls/u);
    await assert.rejects(access(calls), {code: 'ENOENT'});
    await cli('check', [...args, '--scenarios', 'code-spec', '--call']);
    assert.equal(await readFile(calls, 'utf8'), 'code-spec\n');
    await running;
    assert.deepEqual((await readFile(runCalls, 'utf8')).trim().split('\n'), ['commit-audit', 'code-spec', 'code-standards', 'spec-readiness']);
    const bundle = (await cli('pack', ['--out', 'results'])).stdout.trim();
    assert.match(bundle, /\/results\/bundle-\d{8}-\d{9}\.tar\.gz$/u);
    const {stdout: manifestText} = await runSuccessfulProcess('tar', ['-xOzf', bundle, 'manifest.json'], {cwd, env});
    const manifest = JSON.parse(manifestText);
    assert.equal(manifest.arwVersion, installedVersion);
    assert.deepEqual(manifest.arw, origin);
    assert.deepEqual(manifest.harness, {provider: 'fake', version: 'fake 1'});
    assert.equal(manifest.cells.length, 4);
    const sourceScoreCommand = join(SOURCE_DIRECTORY, 'scripts', 'reviewer-capability.mjs');
    // Scoring uses the source fixtures, so the broken-installation run below is independent of it and runs alongside.
    const scored = Promise.all(manifest.cells.map(async (/** @type {{dir: string}} */ {dir}) => {
        const instance = join(cwd, 'results', 'runs', dir);
        const record = JSON.parse(await readFile(join(instance, 'run.json'), 'utf8'));
        assert.equal(record.validity.valid, true, dir);
        const sourceFixture = join(SOURCE_DIRECTORY, CAPABILITY_FIXTURES, record.scenario);
        const {stdout} = await runSuccessfulProcess(process.execPath, [sourceScoreCommand, 'score', sourceFixture,
            join(instance, record.report), '--no-repair', '--agent', join(instance, 'agent.json'), '--instance', record.id], {cwd, env});
        assert.deepEqual({diagnostics: [], ...JSON.parse(stdout)}, JSON.parse(await readFile(join(instance, 'score.json'), 'utf8')));
    }));
    // A broken scoring input is a failed attempt, with no completed result to package.
    await writeFile(join(installation, CAPABILITY_FIXTURES, 'format-baseline', 'registry.json'), '{}');
    const failed = await runExitedProcess(process.execPath, [join(installation, 'arw.mjs'), 'reviewer-capability', 'run',
        ...args.slice(0, -1), 'failed-results', '--scenarios', 'code-spec'], {cwd, env});
    assert.match(failed.stdout, /failed \(score:/u);
    await assert.rejects(access(join(cwd, 'failed-results', 'runs')), {code: 'ENOENT'});
    await scored;
});

test('bootstrap runs tar inside the download directory with a relative archive name', async t => {
    const root = await createTemporaryDirectory(t, 'arw-bootstrap-tar-');
    const directory = join(root, 'download');
    await mkdir(directory);
    await installFakeCommand(t, root, 'tar', `printf '%s\\n' "$PWD" "$*" > '${join(root, 'record')}'\n`);

    await runBootstrap(['--version', '0.2.0'], {
        createTemporaryDirectory: async () => directory,
        download: async () => Buffer.from('archive'),
        launchInstaller: async () => 0,
        loadReleaseConfiguration: async () => RELEASE_CONFIGURATION,
        runtimeVersion: '24.0.0',
    });

    assert.equal(await readFile(join(root, 'record'), 'utf8'), `${directory}\n-xzf arw.tar.gz\n`);
});

test('Bootstrap artifact projects the canonical remote from Release configuration', async t => {
    const [bootstrapSource, runtimeCompatibilitySource] = await Promise.all([
        readFile(new URL('../../lib/installation/bootstrap.mjs', import.meta.url), 'utf8'),
        readFile(new URL('../../lib/arw-common/runtime-compatibility.mjs', import.meta.url), 'utf8'),
    ]);
    const baseConfiguration = JSON.parse(await readFile(new URL('../../release-validation.json', import.meta.url), 'utf8'));
    const render = async (/** @type {string} */ remote) => {
        const root = await createTemporaryDirectory(t, 'arw-bootstrap-configuration-');
        await Promise.all([
            mkdir(join(root, 'lib', 'arw-common'), {recursive: true}),
            mkdir(join(root, 'lib', 'installation'), {recursive: true}),
            mkdir(join(root, 'scripts'), {recursive: true}),
        ]);
        await Promise.all([
            writeFile(join(root, 'lib', 'arw-common', 'runtime-compatibility.mjs'), runtimeCompatibilitySource, 'utf8'),
            writeFile(join(root, 'lib', 'installation', 'bootstrap.mjs'), bootstrapSource, 'utf8'),
            writeFile(join(root, 'release-validation.json'), `${JSON.stringify({
                ...baseConfiguration,
                repositories: {
                    ...baseConfiguration.repositories,
                    sourceCheckout: {...baseConfiguration.repositories.sourceCheckout, url: remote},
                },
            }, null, 2)}\n`, 'utf8'),
            writeFile(join(root, 'scripts', 'install-arw.mjs'), '', 'utf8'),
        ]);
        assert.equal((await generateBootstrapArtifact({mode: 'write', sourceDirectory: root})).status, 'succeeded');
        return readFile(join(root, 'scripts', 'install-arw.mjs'), 'utf8');
    };
    const first = await render('https://example.invalid/team/arw.git');
    const second = await render('https://example.invalid/team/changed.git');

    assert.match(first, /https:\/\/example\.invalid\/team\/arw\.git/u);
    assert.doesNotMatch(first, /release-validation-config\.mjs/u);
    assert.notEqual(first, second);
});


test('bootstrap bounds downloads and launches the installer with the active Node executable', async t => {
    /** @type {Array<{file: string, args: string[]}>} */
    const launched = [];
    const start = t.mock.method(childProcess, 'spawn', (/** @type {string} */ file, /** @type {string[]} */ args) => {
        launched.push({file, args});
        const child = new EventEmitter();
        queueMicrotask(() => child.emit('close', 0, null));
        return child;
    });
    syncBuiltinESMExports();
    t.after(() => { start.mock.restore(); syncBuiltinESMExports(); });
    let aborted = false;
    t.mock.method(globalThis, 'fetch', async (/** @type {string} */ _url, /** @type {{signal: AbortSignal}} */ options) => {
        assert.ok(options.signal instanceof AbortSignal);
        if (aborted) {
            options.signal.throwIfAborted();
            assert.fail('The timeout signal must be aborted.');
        }
        return new Response('archive');
    });
    const options = {
        createTemporaryDirectory: async () => 'unused', extractArchive: async () => {},
        loadReleaseConfiguration: async () => RELEASE_CONFIGURATION, removeTemporaryDirectory: async () => {},
    };
    assert.equal(await runBootstrap(['--version', '0.2.0'], options), 0);
    assert.equal(launched[0].file, process.execPath);
    assert.ok(launched[0].args.includes('--release-tag'));
    aborted = true;
    t.mock.method(AbortSignal, 'timeout', (/** @type {number} */ milliseconds) => {
        assert.equal(milliseconds, 60_000);
        return AbortSignal.abort(new DOMException('Download timed out.', 'TimeoutError'));
    });
    await assert.rejects(runBootstrap(['--version', '0.2.0'], options), {name: 'TimeoutError'});
    assert.equal(launched.length, 1);
});
