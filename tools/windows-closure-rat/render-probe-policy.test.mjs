import test from 'node:test';
import assert from 'node:assert/strict';
import { renderProbeOptions } from './render-probe-policy.mjs';
import { spawnSync } from 'node:child_process';
test('完整渲染探针无外层短帽子，已更长内层保留且拒绝非法配置', () => {
 const options=renderProbeOptions({PATH:process.env.PATH}, {PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS:'30',FFMPEG_ENCODE_TIMEOUT_MS:'900000'});
 assert.equal(options.timeout,undefined);
 assert.equal(options.env.PRODUCER_PAGE_NAVIGATION_TIMEOUT_MS,'120000');
 assert.equal(options.env.FFMPEG_ENCODE_TIMEOUT_MS,'900000');
 assert.equal(options.env.PRODUCER_PUPPETEER_PROTOCOL_TIMEOUT_MS,'300000');
 assert.throws(()=>renderProbeOptions({}, {FFMPEG_ENCODE_TIMEOUT_MS:'NaN'}));
 // 实际进程入口只运行隔离定时fixture，未调用渲染器/模型/远程服务。
 const result=spawnSync(process.execPath,['-e',"setTimeout(()=>console.log('original-result'),80)"],{encoding:'utf8',...options});
 assert.equal(result.status,0);assert.match(result.stdout,/original-result/);
});
