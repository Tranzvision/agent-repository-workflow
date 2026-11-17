import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import test from 'node:test';
import {evaluateIgnoreRules} from '../../lib/common/git-ignore.mjs';
import {createTemporaryDirectory} from '../helpers/cleanup.mjs';

test('ignore evaluation preserves the Git read error code and message', async t => {
    const root = await createTemporaryDirectory(t, 'git-ignore-');
    t.mock.method(childProcess, 'spawn', (/** @type {string} */ _command, /** @type {string[]} */ argv) => {
        const child = Object.assign(new EventEmitter(), {stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough()});
        setImmediate(() => {
            child.stdout.end();
            child.stderr.end();
            if (argv.includes('check-ignore')) child.emit('error', new Error('unavailable'));
            else child.emit('close', 0);
        });
        return child;
    });
    syncBuiltinESMExports();
    try {
        await assert.rejects(evaluateIgnoreRules({directory: join(root, 'rules'), excludesFile: '.arwignore', label: 'Audit', paths: ['a'], rules: new Map()}),
            {code: 'EIO', message: 'Git ignore facts could not be read.'});
    } finally {
        t.mock.restoreAll();
        syncBuiltinESMExports();
    }
});
