import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const evidence='docs/research/evidence/t1044/';
if(process.argv[2]==='diagnostic'){
 const initial=JSON.parse(readFileSync(evidence+'native-startup-diagnostic.json','utf8'));
 assert.equal(initial.exitCode,0);assert.equal(initial.handshakeFrameCount,2);
 const text=readFileSync(evidence+'native-startup-mechanism.log','utf8');
 assert(text.includes('invalid transport'));assert(text.includes('mcp_servers."probe"'));assert(text.includes('CODEX_PROCESS_EXITED'));
 console.log('真实诊断与基础握手对照通过');
}else{
 const text=readFileSync(evidence+'native-startup-encoding-fixed.log','utf8');
 assert(text.includes('allMcpDisabled: true'));assert(text.includes('modelTurnSent: false'));assert(!text.includes('FAKE_FAILURE'));
 const require=createRequire(join(process.cwd(),'ai-worker/package.json'));
 const main=require.resolve('@openai/codex/package.json');
 const pkg=createRequire(main).resolve(`@openai/codex-${process.platform}-${process.arch}/package.json`);
 assert.equal(process.platform,'darwin');assert.equal(process.arch,'arm64');
 const binary=join(dirname(pkg),'vendor/aarch64-apple-darwin/bin/codex');
 const result=spawnSync('python3',['-u',evidence+'probe_thread.py',binary,'startup-verification'],{encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stderr);
 assert(result.stdout.includes("'probe': 'disabled'"));assert(result.stdout.includes('thread/start: ok'));
 console.log(result.stdout);
}
