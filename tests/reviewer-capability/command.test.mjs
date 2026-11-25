import assert from 'node:assert/strict';
import test from 'node:test';

import {callCommand} from '../../lib/reviewer-capability/command.mjs';

test('callCommand settles shortly after the model exits although a background grandchild holds the pipes', {skip: process.platform === 'win32'}, async () => {
    // One real process boundary. Over 100 ms by design: it waits out the 1 s drain grace; without the fix the grandchild keeps `close` from firing for 30 s.
    const call = await callCommand(['sh', '-c', 'sleep 30 & echo done'], {cwd: process.cwd(), timeoutMs: 500});
    assert.equal(call.code, 0);
    assert.equal(call.timedOut, false);
    assert.match(call.stdout, /done/u);
    assert.ok(call.seconds < 10);
});
