import {beforeAll,afterAll,it,expect} from 'vitest';import {execFileSync} from 'node:child_process';import {mkdir,mkdtemp,readFile,readdir,realpath,rm,symlink,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
// 这是明确旧版本的合成 fixture producer，不是历史用户库实测。
const oldProducerCommit='6e4689b3180f91189110208267708ad72b03ae64';
let oldProducerRoot:string,oldProducerModule:string,oldPiCoreBinding:{version:string;agentPath:string;sha256:string};
beforeAll(async()=>{
 const projectRoot='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator';
 // 第一例也依赖真实 Worker；不再依赖其他测试先完成构建。
 oldProducerRoot=await realpath(await mkdtemp(join(tmpdir(),'t1089-old-producer-')));
 const archive=execFileSync('git',['archive',oldProducerCommit,'backend','contract','ai-worker','frontend/src','frontend/tsconfig.json','frontend/package.json','frontend/product-identity.json','frontend/public/courses'],{cwd:projectRoot,maxBuffer:128*1024*1024,timeout:180000});
 execFileSync('tar',['-x','-C',oldProducerRoot],{input:archive,timeout:180000});
 // 外部依赖复用已安装版本；所有 CreatorOS workspace 链接指向旧源，禁止落回当前模块。
 for(const pkg of ['backend','contract','ai-worker','frontend']){
  const target=join(oldProducerRoot,pkg,'node_modules');await mkdir(target,{recursive:true});
  for(const entry of await readdir(join(projectRoot,pkg,'node_modules'))){
   if(entry==='@creatoros')continue;
   await symlink(join(projectRoot,pkg,'node_modules',entry),join(target,entry));
  }
  await mkdir(join(target,'@creatoros'));
  for(const workspace of ['backend','contract','ai-worker'])await symlink(join(oldProducerRoot,workspace),join(target,'@creatoros',workspace));
 }
 // 旧 Pi 真消费者按 cwd 的两级 node_modules 寻找 core；复用锁定同版本实物，不造 Agent。
 const store=join(projectRoot,'node_modules/.pnpm');
 const pinned=JSON.parse(await readFile(join(oldProducerRoot,'ai-worker/package.json'),'utf8')).dependencies['@earendil-works/pi-coding-agent'];
 const coreEntries=(await readdir(store)).filter(name=>name.startsWith('@earendil-works+pi-agent-core@'+pinned+'_') || name==='@earendil-works+pi-agent-core@'+pinned);
 expect(coreEntries).toHaveLength(1);
 const core=join(store,coreEntries[0]!,'node_modules/@earendil-works/pi-agent-core');
 const coreVersion=JSON.parse(await readFile(join(core,'package.json'),'utf8')).version;
 expect(coreVersion).toBe(pinned);
 await mkdir(join(oldProducerRoot,'node_modules/@earendil-works'),{recursive:true});
 await symlink(core,join(oldProducerRoot,'node_modules/@earendil-works/pi-agent-core'));
 oldPiCoreBinding={version:coreVersion,agentPath:await realpath(join(oldProducerRoot,'node_modules/@earendil-works/pi-agent-core/dist/agent.js')),sha256:createHash('sha256').update(await readFile(join(core,'dist/agent.js'))).digest('hex')};
 const original=execFileSync('git',['show',oldProducerCommit+':frontend/src/server/legacy-frozen-source-read.integration.test.ts'],{cwd:projectRoot,maxBuffer:4*1024*1024,timeout:180000}).toString();
 const firstStart=original.indexOf("it('已登记账号"),firstEnd=original.indexOf('const recoveryBudget=');
 const loopStart=original.indexOf('let recoveryWorkerBuilt=false;');
 const bodyStart=original.indexOf("  const {createDb,eq,executionTasks",loopStart);
 const split=original.indexOf('   const upgraded=await createDb({dataDir:old.dataDir});',bodyStart);
 const cleanupStart=original.indexOf('  }finally{',split),cleanupEnd=original.lastIndexOf('\n });');
 expect([firstStart,firstEnd,loopStart,bodyStart,split,cleanupStart,cleanupEnd].every(n=>n>=0)).toBe(true);
 const prelude=original.slice(0,firstStart)+original.slice(firstEnd,loopStart);
 const producer=original.slice(bodyStart,split)
  .replace("resolve('../ai-worker/dist/execution-worker.cjs')",JSON.stringify(join(oldProducerRoot,'ai-worker/dist/execution-worker.cjs')))
  .replace('void result.catch(()=>undefined);return {result};',"void result.then(value=>console.info('[T1089-old-worker-result]',value),error=>console.error('[T1089-old-worker-error]',error));return {result};")
  .replace('await phase;const current=ports!;',"await phase;const current=ports!;console.info('[T1089-old-port]',port);")
  .replace("default:throw Error('本只读回合不允许未绑定端口:'+port);","default:console.error('[T1089-old-unbound-port]',port,JSON.stringify(raw));throw Error('本只读回合不允许未绑定端口:'+port);");
 const cleanup=original.slice(cleanupStart,cleanupEnd).replace('  }finally{','  }catch(error){').replace(/\n  }\s*$/, '\n process.chdir(producerCwd);throw error;\n }');
 const producerWithSchemaProof=producer.replace('   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?',`   const historicalEngineColumns=(await old.client.query("SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='assistant_execution_engine'")).rows;expect(historicalEngineColumns).toEqual([]);\n   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?`);
 expect(producerWithSchemaProof).not.toBe(producer);
 const result=`\n   const producerBindings={frontendModule:import.meta.url,backendResolved:createRequire(new URL('../../../backend/package.json',import.meta.url)).resolve('@creatoros/backend'),backendPreferenceColumns:Object.keys((await import('@creatoros/backend')).schema.userPreferences)};expect(producerBindings.backendPreferenceColumns).not.toContain('assistantExecutionEngine');\n   process.chdir(producerCwd);\n   return {old,historicalEngineColumns,producerBindings,supervisors,commits,requests,modelErrors,state,server,ctx,canonical,originalArticle,originalGraphic,articleId,graphicId,projectId,readKind,outputIds,sourceCtx,conversation,source,submitted,submittedTask,frozen,ref,before,beforeRequests,beforeHandlers,workerRuns,resume:(next:typeof ports)=>{ports=next;releasePhase?.();releasePhase=undefined;}};\n`;
 oldProducerModule=join(oldProducerRoot,'frontend/src/server/t1089-owned-old-producer.ts');
 await writeFile(oldProducerModule,prelude+'\nexport async function produce(family:RecoveryFamily){\nconst producerCwd=process.cwd();process.chdir('+JSON.stringify(join(oldProducerRoot,'frontend'))+');\ntry{\n'+producerWithSchemaProof+result+cleanup+'\n}finally{process.chdir(producerCwd);}}\n');
 // 源码原字节来自指定 Git 对象；只机械拆出旧测试的迁移前阶段，不改旧生产消费者。
 const oldJournal=JSON.parse(await readFile(join(oldProducerRoot,'backend/drizzle/meta/_journal.json'),'utf8'));
 expect(oldJournal.entries).toHaveLength(105);expect(oldJournal.entries.at(-1).tag).toBe('0130_legacy_source_ownership');
 expect(await readFile(join(oldProducerRoot,'backend/src/schema/settings.ts'),'utf8')).not.toContain('assistantExecutionEngine');
 execFileSync(process.execPath,[join(oldProducerRoot,'ai-worker/scripts/build.mjs')],{cwd:join(oldProducerRoot,'frontend'),stdio:'pipe',timeout:1200000});
},3300000);
afterAll(async()=>{if(oldProducerRoot)await rm(oldProducerRoot,{recursive:true,force:true});},180000);

it('真实旧104迁移前producer仅受控local SSE',async()=>{
const loaded=await import(pathToFileURL(oldProducerModule).href);let made;
try{made=await loaded.produce('null-frozen');expect(made.old.ledger).toHaveLength(104);expect(made.historicalEngineColumns).toEqual([]);expect(made.requests).toHaveLength(2);expect(made.state.handlers).toBe(1);expect(made.commits).toHaveLength(1);const {buildChatTools}=await import('/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/backend/src/modules/ai-runtime/chat-tools.ts');
const {prepareChatToolDefinitions}=await import('/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator/backend/src/modules/ai-runtime/chat-tool-definitions.ts');
const names=['system.features','system.read','system.action.propose','canvas.create.propose','canvas.generate.propose'];
const frozen=made.frozen.tools.filter(t=>names.includes(t.name));
const differences=[];
function diff(a,b,path=''){if(JSON.stringify(a)===JSON.stringify(b))return;if(!a||!b||typeof a!=='object'||typeof b!=='object'){differences.push({path,old:a,current:b});return;}for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],path+'/'+k);}
for(const version of [1,2]){const current=(await prepareChatToolDefinitions(buildChatTools(frozen.map(t=>t.name),{humanizeError:()=>null,assistantReadCatalogVersion:version}))).definitions;diff(frozen,current,'v'+version);}
await writeFile('/tmp/t1246-legacy-calibration/catalog-differences.json',JSON.stringify({oldProducerCommit,frozen,differences},null,2));console.info('CATALOG_DIFFERENCES',JSON.stringify(differences));}
finally{if(made){await Promise.allSettled(made.supervisors.map(s=>s.stop()));made.server.closeAllConnections();await new Promise(done=>made.server.close(done));await made.old.configured.dispose();await rm(made.old.root,{recursive:true,force:true});}}
},500000);
