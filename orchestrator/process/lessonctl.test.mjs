import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { appendJsonlUnique } from './lessonctl.mjs';

test('lesson observation 重跑时按稳定 id 幂等，不重复污染收件箱', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lessonctl-'));
  const file = join(dir, 'LESSON_INBOX.jsonl');
  const rows = [
    { id: 'run-1:BUILD', lifecycle: 'observation' },
    { id: 'run-2:SHIP', lifecycle: 'observation' },
  ];

  assert.equal(appendJsonlUnique(file, rows), 2);
  assert.equal(appendJsonlUnique(file, rows), 0);
  assert.equal(readFileSync(file, 'utf8').trim().split('\n').length, 2);
});
