#!/usr/bin/env node
// 编译真实宿主启动函数；代理只注入独立子进程，不访问安装版数据。
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const root=process.cwd();
const rlib=resolve(process.argv[process.argv.indexOf('--reqwest-rlib')+1] || '');
assert(process.argv.includes('--reqwest-rlib'), '必须明确指定当前宿主构建的reqwest rlib');
const hash=x=>createHash('sha256').update(x).digest('hex');
const rust=readFileSync(join(root,'frontend/src-tauri/src/lib.rs'),'utf8');
const lock=readFileSync(join(root,'frontend/src-tauri/Cargo.lock'),'utf8');
const version=lock.match(/name = "reqwest"\nversion = "([^"]+)"/)[1];
const artifact=rlib.match(/libreqwest-([a-f0-9]+)\.rlib$/)[1];
const fingerprint=join(dirname(dirname(rlib)),'.fingerprint',`reqwest-${artifact}`,'lib-reqwest.json');
const features=JSON.parse(readFileSync(fingerprint,'utf8')).features;
const depInfo=readFileSync(join(dirname(rlib),`reqwest-${artifact}.d`),'utf8');
assert(depInfo.includes(`/reqwest-${version}/`), 'rlib依赖信息须绑定Cargo.lock版本');
assert(features.includes('blocking')&&features.includes('json')&&features.includes('rustls-tls'));
const start=rust.indexOf('const SIDECAR_STARTUP_SENTINEL:');
const end=rust.indexOf('// [T-562]',start);
assert(start>=0 && end>start);
const actual=rust.slice(start,end);
assert(actual.includes('fn wait_until_ready(')&&actual.includes('fn build_sidecar_probe_client('));
const out=mkdtempSync(join(tmpdir(),'t1068-loopback-proxy-'));
const source=join(out,'actual-startup.rs'), binary=join(out,'actual-startup');
writeFileSync(source,`use std::time::Duration;\n${actual}\nfn main() {\n let args:Vec<String>=std::env::args().collect();let port:u16=args[1].parse().unwrap();let mode=&args[2];\n if mode=="raw" {let c=reqwest::blocking::Client::builder().timeout(Duration::from_secs(120)).redirect(reqwest::redirect::Policy::limited(2)).build().unwrap();println!("{}",probe_sidecar_rendered_page(&c,port));return;}\n if mode=="ready" {let c=build_sidecar_probe_client(Duration::from_secs(120)).unwrap();println!("{}",probe_sidecar_rendered_page(&c,port));return;}\n let (tx,rx)=std::sync::mpsc::channel();if mode=="wait" {tx.send(StartupSignal::Verified).unwrap();}\n if mode=="exit" {tx.send(StartupSignal::Verified).unwrap();tx.send(StartupSignal::Exited("fixture-exit".into())).unwrap();}\n let (idle,max)=if mode=="missing" {(Duration::from_millis(200),Duration::from_millis(450))}else{(Duration::from_secs(120),Duration::from_secs(240))};\n println!("{:?}",wait_until_ready(port,idle,max,rx));\n}\n`);
const argv=['--edition=2021','-C','panic=abort',source,'--extern',`reqwest=${rlib}`,'-L',`dependency=${dirname(rlib)}`,'-o',binary];
const c=spawnSync('rustc',argv,{encoding:'utf8'});
writeFileSync(join(out,'compile.json'),JSON.stringify({argv,exit:c.status,stdout:c.stdout,stderr:c.stderr},null,2));
assert.equal(c.status,0,c.stderr);
let hits=0;
const proxy=createServer((q,r)=>{hits++;r.writeHead(502,{'Content-Type':'text/plain'});r.end('neutral proxy refusal');});
const listen=s=>new Promise(r=>s.listen(0,'127.0.0.1',r));
const close=s=>new Promise(r=>s.close(r));
await listen(proxy);
const proxyUrl=`http://127.0.0.1:${proxy.address().port}`;
const keys=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'];
const envFor=overrides=>{const e={...process.env};for(const k of keys)delete e[k];return {...e,...overrides};};
const allProxy={HTTP_PROXY:proxyUrl,HTTPS_PROXY:proxyUrl,ALL_PROXY:proxyUrl,http_proxy:proxyUrl,https_proxy:proxyUrl,all_proxy:proxyUrl,NO_PROXY:'',no_proxy:''};
const receipt={source_sha256:hash(rust),extracted_sha256:hash(actual),reqwest_version:version,reqwest_features:features,rlib,rlib_sha256:hash(readFileSync(rlib)),cases:[],compile_exit:c.status,installed_app_test:false};
const invoke=(port,mode,env)=>new Promise((resolve,reject)=>{const a=[String(port),mode];const p=spawn(binary,a,{env});let stdout='',stderr='';p.stdout.on('data',x=>stdout+=x);p.stderr.on('data',x=>stderr+=x);p.on('error',reject);p.on('close',exit=>resolve({argv:a,exit,stdout:stdout.trim(),stderr}));});
async function run(name,mode,want,env,status=200,body='<main>CreatorOS neutral fixture</main>',ct='text/html',redirects=0) {
 const server=createServer((q,r)=>{const hop=Number(q.url.slice(1))||0;if(hop<redirects){r.writeHead(302,{Location:`/${hop+1}`});r.end();return;}r.writeHead(status,{'Content-Type':ct});r.end(body);});
 await listen(server);const before=hits;
 try {const res=await invoke(server.address().port,mode,envFor(env));const row={name,...res,proxy_hits:hits-before};receipt.cases.push(row);writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));assert.equal(res.exit,0,name+' child exit');assert.equal(res.stdout,want,name);return row;}finally{await close(server);}
}
try {
 const control=await run('default-builder-proxy-502-control','raw','false',allProxy);assert(control.proxy_hits>0,'对照须实际经过代理');
 for(const [name,e] of [['all-proxies-empty-no-proxy',allProxy],['uppercase-proxy',{HTTP_PROXY:proxyUrl,NO_PROXY:''}],['lowercase-proxy',{http_proxy:proxyUrl,no_proxy:''}],['all-proxy',{ALL_PROXY:proxyUrl,NO_PROXY:''}],['unrelated-no-proxy',{...allProxy,NO_PROXY:'example.invalid',no_proxy:'example.invalid'}]]) {const row=await run(name,'ready','true',e);assert.equal(row.proxy_hits,0,name+'本地请求不得进代理');}
 await run('verified-and-real-page','wait','Ready',allProxy);
 await run('page-without-sentinel','missing','TimedOut',allProxy);
 await run('exit-priority-over-page','exit','Exited("fixture-exit")',allProxy);
 for(const [name,status,body,ct] of [['404',404,'missing','text/html'],['500',500,'server error','text/html'],['empty',200,'','text/html'],['not-html',200,'plain','text/plain'],['not-found-body',200,'Page Not Found','text/html'],['not-found-slot',200,'<div data-slot="creator-not-found"></div>','text/html']]) await run(name,'ready','false',allProxy,status,body,ct);
 await run('two-redirects','ready','true',allProxy,200,'<main>real page</main>','text/html',2);
 await run('three-redirects-rejected','ready','false',allProxy,200,'<main>real page</main>','text/html',3);
 receipt.exit=0;writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({receipt:join(out,'receipt.json'),cases:receipt.cases.length,exit:0}));
} catch(e) {receipt.exit=1;receipt.error=String(e);writeFileSync(join(out,'receipt.json'),JSON.stringify(receipt,null,2));console.error(JSON.stringify({receipt:join(out,'receipt.json'),exit:1,error:String(e)}));process.exitCode=1;}
finally {await close(proxy);}
