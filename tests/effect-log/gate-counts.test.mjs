import assert from 'node:assert/strict';
import test from 'node:test';

import {countDispositions, countFindings} from '../../lib/effect-log/gate-counts.mjs';

test('findings count only unindented "- " lines', () => {
    assert.equal(countFindings('No problems.'), 0);
    assert.equal(countFindings('- a\n  continued\n- b\n  - nested\n-c\n'), 2);
});

test('dispositions follow the first phrase on each ledger line', () => {
    assert.deepEqual(countDispositions([
        '- 台账: a.mjs:5 记录不修 措辞',
        '台账: 规范 12 转入后续 issue 0140',
        '- 台账: 冲突裁决 spec 与 code',
        '台账: 记录不修 随后转入后续 issue',
        '记录不修 不以台账开头',
        '台账: 见上',
    ]), {'follow-up': 1, 'not-fixed': 2, arbitration: 1});
});
