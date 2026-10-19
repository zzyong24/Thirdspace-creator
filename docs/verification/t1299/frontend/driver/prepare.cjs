'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto'),cp=require('node:child_process');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function main(){
 if(process.argv[2]!=='--prepare')throw Error('EXPLICIT_PREPARE_REQUIRED_NO_SERVER_STARTED');
 const sourceRoot=fs.realpathSync(process.argv[3]||process.cwd()),evidenceRoot=path.resolve(__dirname,'..','runs','prepared-'+crypto.randomBytes(8).toString('hex'));fs.mkdirSync(evidenceRoot,{recursive:true,mode:0o700});
 const ownedRoot=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'t1299-browser-'));fs.chmodSync(ownedRoot,0o700);
 const marker={task:'T-1299',purpose:'owned-browser-db-auth-media-cache-only',uid:process.getuid(),nonce:crypto.randomUUID(),at:new Date().toISOString()};fs.writeFileSync(path.join(ownedRoot,'owner.json'),JSON.stringify(marker,null,2)+'\n',{flag:'wx',mode:0o600});
 for(const name of ['pglite','media','auth-douyin','auth-web','app','tmp','cache','config','backups','logs','browser-profile'])fs.mkdirSync(path.join(ownedRoot,name),{mode:0o700});
 const server=net.createServer();await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});const port=server.address().port;await new Promise(ok=>server.close(ok));
 const sourcePaths=cp.execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z','--','frontend/src','backend/src','backend/drizzle','contract/src','ai-worker/src','ai-worker/dist','frontend/next.config.ts','frontend/package.json','pnpm-lock.yaml','frontend/tests/e2e/t1298-script-first-live-acceptance.spec.ts','docs/verification/t1299/frontend/driver','docs/verification/t1299/frontend/measure-tabs.cjs'],{cwd:sourceRoot,encoding:'utf8',maxBuffer:64*1024*1024}).split('\0').filter(p=>p&&fs.existsSync(path.join(sourceRoot,p))&&fs.statSync(path.join(sourceRoot,p)).isFile()).sort();
 for(const f of fs.readdirSync(__dirname))sourcePaths.push(path.relative(sourceRoot,path.join(__dirname,f)));sourcePaths.push('docs/verification/t1299/frontend/measure-tabs.cjs');
 const files=[...new Set(sourcePaths)].map(p=>({path:p,sha256:sha(path.join(sourceRoot,p))}));
 const bundles=fs.readdirSync(path.join(sourceRoot,'ai-worker/dist')).filter(p=>p.endsWith('.cjs')).sort().map(p=>({path:'ai-worker/dist/'+p,sha256:sha(path.join(sourceRoot,'ai-worker/dist',p))}));
 if(!bundles.some(x=>x.path.endsWith('/execution-worker.cjs'))||!bundles.some(x=>x.path.endsWith('/codex-status-worker.cjs')))throw Error('NORMAL_BUILT_WORKER_BUNDLES_REQUIRED');
 const binding={task:'T-1299',state:'prepared-not-started-not-run',sourceRoot,ownedRoot,evidenceRoot,port,baseURL:'http://127.0.0.1:'+port,markerSha256:sha(path.join(ownedRoot,'owner.json')),uid:process.getuid(),sourceHead:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:sourceRoot,encoding:'utf8'}).trim(),files,bundles,physicalSourceCopy:false,physicalDependencyCopy:false,userAppStop:false,originalAuth:'normal host-controlled HOME/CODEX_HOME inherited; no secret read/copied/logged by driver',preparedAt:new Date().toISOString()};
 const bindingPath=path.join(evidenceRoot,'binding.json');fs.writeFileSync(bindingPath,JSON.stringify(binding,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({bindingPath,ownedRoot,baseURL:binding.baseURL,sourceFiles:files.length,bundles:bundles.length,serverStarted:false}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
