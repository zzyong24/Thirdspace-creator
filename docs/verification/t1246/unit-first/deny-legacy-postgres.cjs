// T1246独立测试环境护栏。真实拒绝既有任务PG连接；不返回模拟网络/SQL响应。
const net = require('node:net');
const errorCode = 'T1246_ENV_NOT_OWNED_PG';
const legacyPort = 55422;
const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1']);
if (typeof net._normalizeArgs !== 'function') {
  const error = new Error('T1246_ENV_GUARD_UNSUPPORTED_NODE: 无法核对Socket连接参数，停止测试');
  error.code = 'T1246_ENV_GUARD_UNSUPPORTED_NODE';
  throw error;
}
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function t1246GuardedConnect(...args) {
  // Node25 Socket.connect本身接收内部已规范化数组；其余合法签名交由同一规范化函数读取。
  const normalized = Array.isArray(args[0]) ? args[0] : net._normalizeArgs(args);
  const options = normalized[0] || {};
  const host = String(options.host ?? 'localhost').toLowerCase();
  if (!options.path && Number(options.port) === legacyPort && loopbackHosts.has(host)) {
    const error = new Error(`${errorCode}: 本轮不拥有${host}:${legacyPort}，真实连接前拒绝；这是环境前置阻断，不是产品失败`);
    error.code = errorCode;
    throw error;
  }
  return Reflect.apply(originalConnect, this, args);
};
module.exports = Object.freeze({ errorCode, legacyPort, loopbackHosts: [...loopbackHosts] });
