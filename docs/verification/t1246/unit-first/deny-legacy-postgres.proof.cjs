// 无网络证明：实际护栏源码在VM中执行，原Socket.connect为记录桩；Node25参数规范化用真实实现。
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const realNet = require('node:net');
const guardFile = '/tmp/t1246-unit/deny-legacy-postgres.cjs';
const source = fs.readFileSync(guardFile, 'utf8');
const forwarded = [], results = [];
const sentinel = { originalReturn: true };
class FakeSocket {}
FakeSocket.prototype.connect = function (...args) { forwarded.push({ receiver: this, args }); return sentinel; };
const fakeNet = { Socket: FakeSocket, _normalizeArgs: realNet._normalizeArgs };
new vm.Script(source, { filename: guardFile }).runInNewContext({ require: id => { assert.equal(id, 'node:net'); return fakeNet; }, module: { exports: {} } }, { timeout: 120000 });
const socket = new FakeSocket();
function denied(name, args) {
  const before = forwarded.length;
  assert.throws(() => socket.connect(...args), error => error.code === 'T1246_ENV_NOT_OWNED_PG');
  assert.equal(forwarded.length, before, '拒绝必须先于原connect');
  results.push({ name, status: 'PASS', originalConnectCalls: 0 });
}
function allowed(name, args) {
  const before = forwarded.length;
  assert.equal(socket.connect(...args), sentinel);
  assert.equal(forwarded.length, before + 1);
  const actual = forwarded.at(-1);
  assert.equal(actual.receiver, socket);
  assert.equal(actual.args.length, args.length);
  args.forEach((arg, i) => assert.equal(actual.args[i], arg, '原参数引用/值保持'));
  results.push({ name, status: 'PASS', originalConnectCalls: 1 });
}
for (const host of ['localhost', '127.0.0.1', '::1']) {
  denied(`options ${host}`, [{ host, port: 55422 }]);
  denied(`numeric ${host}`, [55422, host, () => {}]);
  denied(`string port ${host}`, ['55422', host]);
  denied(`normalized ${host}`, [realNet._normalizeArgs([55422, host])]);
}
denied('implicit localhost', [55422]);
denied('options implicit localhost string port', [{ port: '55422' }]);
denied('localhost case', [{ host: 'LOCALHOST', port: 55422 }]);
allowed('本轮50028 options', [{ host: '127.0.0.1', port: 50028 }, () => {}]);
allowed('本轮50028 numeric', [50028, '127.0.0.1', () => {}]);
allowed('其它端口localhost', [5432, 'localhost']);
allowed('非本机55422', [{ host: 'example.invalid', port: 55422 }]);
allowed('Unix socket保持', ['/tmp/t1246-owned.socket', () => {}]);
allowed('normalized其它端口保持', [realNet._normalizeArgs([50028, '::1'])]);
const report = { task: 'T-1246', recordedAt: new Date().toISOString(), guardFile, guardSha256: crypto.createHash('sha256').update(source).digest('hex'), node: process.version, testBudgetMs: 120000, retry: 0, realNetworkCalls: 0, evidenceLevel: '实际护栏源码+真实Node参数规范化+无网络原connect桩；不是PG连接/完整Vitest证明', passed: results.length, failed: 0, results };
fs.writeFileSync('/tmp/t1246-unit/deny-legacy-postgres.proof.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
