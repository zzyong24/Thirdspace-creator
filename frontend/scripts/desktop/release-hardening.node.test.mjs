import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const base=resolve(import.meta.dirname, '../../..');
const file=name=>resolve(base,'frontend',name);
test('7项正式链禁止混淆/字节码/诱饵/增包盖章且保独立真实冒烟',()=>{
 const p=readFileSync(file('scripts/desktop/package.mjs'),'utf8');
 for(const name of ['obfuscate.mjs','bytecode.mjs','decoy.mjs','legal-stamp.mjs']) assert.ok(!p.includes(`"${name}"`),name);
 assert.ok(p.includes('runtime-smoke.mjs')); assert.ok(p.includes('runSidecarSigning'));
});
test('最终tar出口签名、skip clean policy与直接依赖',()=>{
 const p=readFileSync(file('scripts/desktop/build-sidecar.mjs'),'utf8');
 assert.ok(p.includes('runSidecarSigning({ tarball, env: sidecarSigningEnv })'));assert.ok(p.includes('cleanReusable'));
 assert.equal(JSON.parse(readFileSync(file('package.json'),'utf8')).devDependencies['@noble/hashes'],'1.8.0');
 for(const name of ['tauri.conf.json','tauri.windows.conf.json']) assert.ok(JSON.parse(readFileSync(file('src-tauri/'+name),'utf8')).bundle.resources.includes('sidecar.tar.gz.sig'));
});
test('独立冒烟保boot、HTTP、dispatch、Chromium hydration、原超时与关闭',()=>{
 const p=readFileSync(file('scripts/desktop/runtime-smoke.mjs'),'utf8');
 for(const token of ['buildSmokeSidecarEnv','net.connect','httpProbe','browserHydrationProbe','pageerror','withinExecution(browser.close())','cleanup();','executionTimeoutMs']) assert.ok(p.includes(token),token);
 assert.ok(!p.includes('javascript-obfuscator'));
});
test('desktop release CSP保inline/blob预览且web/debug无头',async()=>{
 const {desktopReleaseHeaders}=await import(file('scripts/desktop/desktop-csp.mjs'));
 assert.deepEqual(desktopReleaseHeaders({CREATOROS_DESKTOP:'1'}),[]);
 assert.deepEqual(desktopReleaseHeaders({CREATOROS_SIDECAR_SIGNING_REQUIRED:'1'}),[]);
 const policy=desktopReleaseHeaders({CREATOROS_DESKTOP:'1',CREATOROS_SIDECAR_SIGNING_REQUIRED:'1'})[0].headers[0].value;
 for(const text of ["script-src 'self' 'unsafe-inline'","frame-src 'self' blob:","worker-src 'self' blob:","object-src 'none'"])assert.ok(policy.includes(text));
 assert.ok(!policy.includes('unsafe-eval'));
});
