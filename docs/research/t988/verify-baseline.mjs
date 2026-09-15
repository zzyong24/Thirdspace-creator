import fs from 'node:fs';import assert from 'node:assert/strict';
const b=JSON.parse(fs.readFileSync(new URL('./baseline.json',import.meta.url)));assert.equal(b.browser.requests.filter(x=>x.rsc).length,5);assert.ok(b.browser.elapsedMs>3000);assert.ok(b.browser.metric.includes('总播放量'));assert.ok(Object.values(b.diagnosis).every(Boolean));console.log('诊断证据完整，不代表修复通过');
