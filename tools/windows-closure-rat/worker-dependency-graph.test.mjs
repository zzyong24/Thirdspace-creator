import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,copyFileSync,readdirSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {stageScopedWorkerDependencies,stageMissingDependencies,assertLayeredWorkerNativeFiles} from './stage-layered-workers.mjs';
const resolver=fileURLToPath(new URL('./creatoros-module-resolver.cjs',import.meta.url));
function pkg(base,name,manifest,files) {const p=join(base,'node_modules',name);mkdirSync(p,{recursive:true});writeFileSync(join(p,'package.json'),JSON.stringify({name,version:'1',main:'index.js',...manifest}));for(const [n,s]of Object.entries(files)){mkdirSync(dirname(join(p,n)),{recursive:true});writeFileSync(join(p,n),s);}return p;}
function fixture(sameVersion=false) {
 const root=mkdtempSync(join(tmpdir(),'worker-scope-'));const source=join(root,'source'),runtimeRoot=join(root,'runtime');mkdirSync(source);writeFileSync(join(source,'package.json'),'{}');
 const a=pkg(source,'a',{dependencies:{zip:'1'},exports:{'.':{require:'./index.js',import:'./esm.mjs'},'./sub':'./sub.js','./blocked':null}}, {'index.js':"module.exports={zip:require('zip'),self:require('a/sub'),relative:require('./sub'),builtin:require('node:path').sep}",'sub.js':'module.exports="sub"','esm.mjs':"import zip from 'zip';export default {zip};"});
 const b=pkg(source,'b',{dependencies:{zip:'2'}},{'index.js':"module.exports=require('zip')"});
 pkg(a,'zip',{version:'1'},{'index.js':'module.exports="first"','LICENSE':'license-one'});pkg(b,'zip',{version:sameVersion?'1':'2'},{'index.js':'module.exports="second"','LICENSE':'license-two'});
 mkdirSync(join(runtimeRoot,'frontend/runtime'),{recursive:true});copyFileSync(resolver,join(runtimeRoot,'frontend/creatoros-module-resolver.cjs'));
 const entry=join(runtimeRoot,'frontend/runtime/execution-worker.cjs');writeFileSync(entry,"Promise.all([import('a'),Promise.resolve(require('a')),Promise.resolve(require('b'))]).then(([esm,a,b])=>console.log(JSON.stringify({esm:esm.default.zip,a,b}))).catch(e=>{console.error(e.code,e.message);process.exitCode=1})");
 return {root,source,runtimeRoot,a,b,entry,options:{from:source,runtimeRoot,packages:['a','b'],entries:['execution-worker.cjs']}};
}
function globalPkg(f,name,body){const base=join(f.root,'global');const p=pkg(base,name,{}, {'index.js':body});const dest=join(f.runtimeRoot,'frontend/.next/vendor',name);mkdirSync(dirname(dest),{recursive:true});renameSync(p,dest);}
function run(f,entry=f.entry) {return spawnSync(process.execPath,['--require',join(f.runtimeRoot,'frontend/creatoros-module-resolver.cjs'),entry],{encoding:'utf8',env:{PATH:process.env.PATH,CREATOROS_RUNTIME_ROOT:f.runtimeRoot},timeout:15000});}
function mutate(f,fn){const path=join(f.runtimeRoot,'frontend/worker-dependency-map.json');const d=JSON.parse(readFileSync(path));fn(d);writeFileSync(path,JSON.stringify(d));}
for(const same of [false,true])test(`真实两父解析保留${same?'同版本不同来源':'不同版本'}，CJS/ESM/self/subpath/relative/builtin不被全局诱饵接管`,()=>{const f=fixture(same);try{
 assert.throws(()=>stageMissingDependencies({from:f.source,vendorRoot:join(f.root,'flat'),packages:['a','b']}),/不能平铺覆盖/);
 const graph=stageScopedWorkerDependencies(f.options);assert.equal(Object.keys(graph.nodes).length,4);
 globalPkg(f,'zip','throw new Error("global-decoy")');
 const p=run(f);assert.equal(p.status,0,p.stderr);const out=JSON.parse(p.stdout);assert.equal(out.a.zip,'first');assert.equal(out.b,'second');assert.equal(out.esm,'first');assert.equal(out.a.self,'sub');assert.equal(out.a.relative,'sub');
 for(const n of Object.values(graph.nodes)){assert.ok(readFileSync(join(f.runtimeRoot,n.root,'package.json')));assert.ok(!readdirSync(join(f.runtimeRoot,n.root)).includes('node_modules'));}
 }finally{rmSync(f.root,{recursive:true,force:true});}});
for(const kind of ['missing-map','missing-edge','unknown-node','escape','manifest'])test('图'+kind+'拒绝回全局借包',()=>{const f=fixture();try{stageScopedWorkerDependencies(f.options);
 if(kind==='missing-map')rmSync(join(f.runtimeRoot,'frontend/worker-dependency-map.json'));
 else mutate(f,g=>{const a=Object.values(g.nodes).find(n=>n.name==='a');if(kind==='missing-edge')delete a.dependencies.zip;if(kind==='unknown-node')a.dependencies.zip='p9999';if(kind==='escape')a.root='../escape';if(kind==='manifest')a.manifestSHA256='0'.repeat(64);});
 const p=run(f);assert.notEqual(p.status,0);assert.match(p.stderr,/Worker 依赖图/);
 }finally{rmSync(f.root,{recursive:true,force:true});}});
test('exports显式阻止的subpath不得回退裸文件',()=>{const f=fixture();try{stageScopedWorkerDependencies(f.options);writeFileSync(f.entry,"require('a/blocked')");const p=run(f);assert.notEqual(p.status,0);assert.match(p.stderr,/ERR_PACKAGE_PATH_NOT_EXPORTED/);}finally{rmSync(f.root,{recursive:true,force:true});}});
test('非精确Worker入口仍用原全局层，不被扩大图权限',()=>{const f=fixture();try{stageScopedWorkerDependencies(f.options);const entry=join(f.runtimeRoot,'frontend/runtime/other.cjs');writeFileSync(entry,"console.log(require('global-only'))");globalPkg(f,'global-only','module.exports="global"');const p=run(f,entry);assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'global');assert.throws(()=>stageScopedWorkerDependencies({...f.options,runtimeRoot:join(f.root,'other'),entries:['other.cjs']}),/不是已声明/);}finally{rmSync(f.root,{recursive:true,force:true});}});
test('可缺peer仅显式optional，必需peer缺失或导出错误不能吞',()=>{const f=fixture();try{let m=JSON.parse(readFileSync(join(f.a,'package.json')));m.peerDependencies={missing:'1'};writeFileSync(join(f.a,'package.json'),JSON.stringify(m));assert.throws(()=>stageScopedWorkerDependencies(f.options),/Cannot find module/);rmSync(join(f.runtimeRoot,'frontend/.next/worker-packages'),{recursive:true});m.peerDependenciesMeta={missing:{optional:true}};writeFileSync(join(f.a,'package.json'),JSON.stringify(m));assert.doesNotThrow(()=>stageScopedWorkerDependencies(f.options));}finally{rmSync(f.root,{recursive:true,force:true});}});

test('图内原生依赖必须完整，不能借全局诱饵掩盖图内缺文件',()=>{const f=fixture();try{
 const codex=pkg(f.source,'@openai/codex',{version:'0.159.3',optionalDependencies:{'@openai/codex-win32-x64':'npm:@openai/codex@0.159.3-win32-x64'}},{'index.js':'module.exports=1'});
 pkg(codex,'@openai/codex-win32-x64',{name:'@openai/codex',version:'0.159.3-win32-x64',os:['win32'],cpu:['x64']},{'vendor/x86_64-pc-windows-msvc/bin/codex.exe':'codex-fixture'});
 const fs=pkg(f.source,'@openclaw/fs-safe',{optionalDependencies:{'@openclaw/fs-safe-win32-x64-msvc':'1'}},{'index.js':'module.exports=1'});
 pkg(fs,'@openclaw/fs-safe-win32-x64-msvc',{os:['win32'],cpu:['x64']},{'fs-safe-native.node':'native-fixture'});
 const g=stageScopedWorkerDependencies({...f.options,packages:['@openai/codex','@openclaw/fs-safe'],targetPlatform:'win32',targetArch:'x64'});
 assert.doesNotThrow(()=>assertLayeredWorkerNativeFiles(f.runtimeRoot));
 const n=Object.values(g.nodes).find(n=>n.aliases.includes('@openclaw/fs-safe-win32-x64-msvc'));rmSync(join(f.runtimeRoot,n.root,'fs-safe-native.node'));
 const decoy=join(f.runtimeRoot,'frontend/.next/vendor/@openclaw/fs-safe-win32-x64-msvc/fs-safe-native.node');mkdirSync(dirname(decoy),{recursive:true});writeFileSync(decoy,'decoy');
 assert.throws(()=>assertLayeredWorkerNativeFiles(f.runtimeRoot),/原生依赖缺失或为空/);
 }finally{rmSync(f.root,{recursive:true,force:true});}});
test('缺失optional与平台不支持仅在可选边跳过；必需边仍拒绝',()=>{const f=fixture();try{
 const m=JSON.parse(readFileSync(join(f.a,'package.json')));m.optionalDependencies={absent:'1',foreign:'1'};writeFileSync(join(f.a,'package.json'),JSON.stringify(m));pkg(f.a,'foreign',{os:['win32']},{'index.js':'module.exports=1'});
 const g=stageScopedWorkerDependencies({...f.options,targetPlatform:'darwin'});const n=Object.values(g.nodes).find(n=>n.name==='a');assert.equal(n.dependencies.absent,undefined);assert.equal(n.dependencies.foreign,undefined);
 rmSync(join(f.runtimeRoot,'frontend/.next/worker-packages'),{recursive:true});delete m.optionalDependencies;m.dependencies.foreign='1';writeFileSync(join(f.a,'package.json'),JSON.stringify(m));assert.throws(()=>stageScopedWorkerDependencies({...f.options,targetPlatform:'darwin'}),/不支持/);
 }finally{rmSync(f.root,{recursive:true,force:true});}});
test('ESM未导出subpath不自动补扩展，CJS仍保原Node扩展解析',()=>{const f=fixture();try{stageScopedWorkerDependencies(f.options);writeFileSync(f.entry,"import('b/index').then(()=>process.exitCode=9).catch(e=>console.log(e.code))");let p=run(f);assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/MODULE_NOT_FOUND/);writeFileSync(f.entry,"console.log(require('b/index'))");p=run(f);assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'second');}finally{rmSync(f.root,{recursive:true,force:true});}});

test('CJS相对与裸subpath JSON和目录main沿Node规则，exports条件顺序按对象原序',()=>{const f=fixture();try{writeFileSync(join(f.b,'data.json'),'{"ok":true}');mkdirSync(join(f.b,'nested'));writeFileSync(join(f.b,'nested/package.json'),'{"main":"value.json"}');writeFileSync(join(f.b,'nested/value.json'),'{"dir":true}');let m=JSON.parse(readFileSync(join(f.a,'package.json')));m.exports['./condition']={default:'./sub.js',require:'./index.js'};writeFileSync(join(f.a,'package.json'),JSON.stringify(m));stageScopedWorkerDependencies(f.options);writeFileSync(f.entry,"console.log(JSON.stringify([require('b/data'),require('b/nested'),require('a/condition')]))");const p=run(f);assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),[{ok:true},{dir:true},'sub']);}finally{rmSync(f.root,{recursive:true,force:true});}});

test('Worker绝对文件路径沿原生下一跳，不作为裸依赖或借全局包',()=>{const f=fixture();try{stageScopedWorkerDependencies(f.options);const local=join(f.runtimeRoot,'owned-absolute.cjs');writeFileSync(local,'module.exports="absolute"');writeFileSync(f.entry,`console.log(require(${JSON.stringify(local)}))`);const p=run(f);assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'absolute');}finally{rmSync(f.root,{recursive:true,force:true});}});

test('Windows UNC不存在路径必须由原生解析器拒绝，不误作Worker裸依赖',{skip:process.platform!=='win32'},()=>{const f=fixture();try{stageScopedWorkerDependencies(f.options);const unc=String.raw`\\localhost\creatoros_t247_nonexistent_share\missing.cjs`;writeFileSync(f.entry,`try{require(${JSON.stringify(unc)});process.exitCode=9}catch(e){if(e.code!=='MODULE_NOT_FOUND'||e.message.includes('Worker 依赖图'))throw e;console.log('native-UNC-MODULE_NOT_FOUND')}`);const p=run(f);assert.equal(p.status,0,p.stderr);assert.equal(p.stdout.trim(),'native-UNC-MODULE_NOT_FOUND');}finally{rmSync(f.root,{recursive:true,force:true});}});

// T247：npm显式声明即便与内置同名，强制包路径也必须保留其父包身份。
for(const name of ['punycode','buffer','string_decoder'])test(`T247显式npm ${name}与裸builtin/node:并存，CJS强制包路径和ESM显式文件保父边`,()=>{const f=fixture();try{
 const manifest=JSON.parse(readFileSync(join(f.a,'package.json')));manifest.dependencies[name]='2.3.1';writeFileSync(join(f.a,'package.json'),JSON.stringify(manifest));
 pkg(f.a,name,{version:'2.3.1'},{'index.js':`module.exports={marker:${JSON.stringify('npm:'+name)}}`});
 writeFileSync(join(f.a,'index.js'),`module.exports={bare:require.resolve(${JSON.stringify(name)}),node:require.resolve(${JSON.stringify('node:'+name)}),npm:require(${JSON.stringify(name+'/')}).marker,version:require(${JSON.stringify(name+'/package.json')}).version}`);
 writeFileSync(join(f.a,'esm.mjs'),`import npm from ${JSON.stringify(name+'/index.js')};export default npm.marker;`);
 const g=stageScopedWorkerDependencies(f.options),owner=Object.values(g.nodes).find(n=>n.name==='a');assert.ok(owner.dependencies[name],'显式同名npm依赖边不可被builtin过滤');assert.equal(g.nodes[owner.dependencies[name]].name,name);
 writeFileSync(f.entry,"Promise.all([import('a'),Promise.resolve(require('a'))]).then(([esm,cjs])=>console.log(JSON.stringify({esm:esm.default,cjs}))).catch(e=>{console.error(e.code,e.message);process.exitCode=1})");
 const p=run(f);assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),{esm:'npm:'+name,cjs:{bare:name,node:'node:'+name,npm:'npm:'+name,version:'2.3.1'}});
 }finally{rmSync(f.root,{recursive:true,force:true});}});
for(const name of ['punycode','buffer','string_decoder'])test(`T247显式npm ${name}必需声明缺真实包仍拒，不能借builtin假满足`,()=>{const f=fixture();try{
 const manifest=JSON.parse(readFileSync(join(f.a,'package.json')));manifest.dependencies[name]='1';writeFileSync(join(f.a,'package.json'),JSON.stringify(manifest));
 assert.throws(()=>stageScopedWorkerDependencies(f.options),/Cannot find module/);
 }finally{rmSync(f.root,{recursive:true,force:true});}});
test('T247显式npm 真实锁定tr46声明punycode强制包路径中文转换可消费',()=>{const f=fixture();try{
 const projectRequire=createRequire(new URL('../../frontend/package.json',import.meta.url));
 const jsdom=projectRequire.resolve('jsdom'),whatwg=createRequire(jsdom).resolve('whatwg-url');
 const g=stageScopedWorkerDependencies({...f.options,from:dirname(whatwg),packages:['tr46']}),tr46=Object.values(g.nodes).find(n=>n.name==='tr46');
 assert.ok(tr46.dependencies.punycode,'真实tr46 npm声明必须有图边');assert.equal(g.nodes[tr46.dependencies.punycode].version,'2.3.1');
 writeFileSync(f.entry,"const tr46=require('tr46');console.log(JSON.stringify({ascii:tr46.toASCII('例子.测试'),unicode:tr46.toUnicode('xn--fsqu00a.xn--0zwm56d')}))");
 const p=run(f);assert.equal(p.status,0,p.stderr);assert.deepEqual(JSON.parse(p.stdout),{ascii:'xn--fsqu00a.xn--0zwm56d',unicode:{domain:'例子.测试',error:false}});
 }finally{rmSync(f.root,{recursive:true,force:true});}});
