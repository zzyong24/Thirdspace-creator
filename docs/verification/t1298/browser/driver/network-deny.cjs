'use strict';
// Only Node-side external network is blocked; the locked native Codex host retains its
// ordinary authenticated transport for the explicitly authorized isolated acceptance chats.
const fs=require('node:fs'),path=require('node:path');
const root=process.env.T1298_OWNED_ROOT;if(!root||!fs.existsSync(path.join(root,'owner.json')))throw Error('T1298_OWNED_NETWORK_GUARD_REQUIRED');
const local=h=>['127.0.0.1','localhost','::1','[::1]'].includes(h);
function reject(kind){fs.appendFileSync(path.join(root,'network-denied.ndjson'),JSON.stringify({at:new Date().toISOString(),kind,denied:true})+'\n',{mode:0o600});throw Error('T1298_EXTERNAL_NETWORK_DENIED');}
function http(value,kind){let host;if(typeof value==='string'||value instanceof URL)host=new URL(value).hostname;else host=value?.hostname??value?.host??'localhost';if(!local(host))reject(kind);}
for(const kind of ['http','https']){const api=require('node:'+kind);for(const method of ['request','get']){const original=api[method];api[method]=function(...args){http(args[0],kind);return Reflect.apply(original,this,args);};}}
const fetch=globalThis.fetch;globalThis.fetch=async function(...args){http(args[0]?.url??args[0],'fetch');return Reflect.apply(fetch,this,args);};
for(const kind of ['net','tls']){const api=require('node:'+kind);for(const method of kind==='net'?['connect','createConnection']:['connect']){const original=api[method];api[method]=function(...args){const value=args[0];if(typeof value==='object'&&value?.path){if(!path.resolve(value.path).startsWith(root+path.sep))reject(kind);}else{const host=typeof value==='object'?value?.host??'localhost':typeof args[1]==='string'?args[1]:'localhost';if(!local(host))reject(kind);}return Reflect.apply(original,this,args);};}}
