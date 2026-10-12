import {beforeAll,afterAll,it,expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
// 这是明确旧版本的合成 fixture producer，不是历史用户库实测。
const oldProducerCommit='6e4689b3180f91189110208267708ad72b03ae64';
let oldProducerRoot:string,oldProducerModule:string;
beforeAll(async()=>{
 const projectRoot='/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator';
 // 第一例也依赖真实 Worker；不再依赖其他测试先完成构建。
 oldProducerRoot=await mkdtemp(join(tmpdir(),'t1089-old-producer-'));
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
 const original=execFileSync('git',['show',oldProducerCommit+':frontend/src/server/legacy-frozen-source-read.integration.test.ts'],{cwd:projectRoot,maxBuffer:4*1024*1024,timeout:180000}).toString();
 const firstStart=original.indexOf("it('已登记账号"),firstEnd=original.indexOf('const recoveryBudget=');
 const loopStart=original.indexOf('let recoveryWorkerBuilt=false;');
 const bodyStart=original.indexOf("  const {createDb,eq,executionTasks",loopStart);
 const split=original.indexOf('   const upgraded=await createDb({dataDir:old.dataDir});',bodyStart);
 const cleanupStart=original.indexOf('  }finally{',split),cleanupEnd=original.lastIndexOf('\n });');
 expect([firstStart,firstEnd,loopStart,bodyStart,split,cleanupStart,cleanupEnd].every(n=>n>=0)).toBe(true);
 const prelude=original.slice(0,firstStart)+original.slice(firstEnd,loopStart);
 const producer=original.slice(bodyStart,split).replace("resolve('../ai-worker/dist/execution-worker.cjs')",JSON.stringify(join(oldProducerRoot,'ai-worker/dist/execution-worker.cjs')));
 const cleanup=original.slice(cleanupStart,cleanupEnd).replace('  }finally{','  }catch(error){').replace(/\n  }\s*$/, '\n throw error;\n }');
 const producerWithSchemaProof=producer.replace('   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?',`   const historicalEngineColumns=(await old.client.query("SELECT column_name FROM information_schema.columns WHERE table_name='user_preferences' AND column_name='assistant_execution_engine'")).rows;expect(historicalEngineColumns).toEqual([]);\n   await (globalThis as typeof globalThis&{__creatorosDisposePersistence?`);
 expect(producerWithSchemaProof).not.toBe(producer);
 const result=`\n   const producerBindings={frontendModule:import.meta.url,backendResolved:createRequire(new URL('../../../backend/package.json',import.meta.url)).resolve('@creatoros/backend'),backendPreferenceColumns:Object.keys((await import('@creatoros/backend')).schema.userPreferences)};expect(producerBindings.backendPreferenceColumns).not.toContain('assistantExecutionEngine');\n   return {old,historicalEngineColumns,producerBindings,supervisors,commits,requests,modelErrors,state,server,ctx,canonical,originalArticle,originalGraphic,articleId,graphicId,projectId,readKind,outputIds,sourceCtx,conversation,source,submitted,submittedTask,frozen,ref,before,beforeRequests,beforeHandlers,workerRuns,resume:(next:typeof ports)=>{ports=next;releasePhase?.();releasePhase=undefined;}};\n`;
 oldProducerModule=join(oldProducerRoot,'frontend/src/server/t1089-owned-old-producer.ts');
 await writeFile(oldProducerModule,prelude+'\nexport async function produce(family:RecoveryFamily){\n'+producerWithSchemaProof+result+cleanup+'\n}\n');
 // 源码原字节来自指定 Git 对象；只机械拆出旧测试的迁移前阶段，不改旧生产消费者。
 const oldJournal=JSON.parse(await readFile(join(oldProducerRoot,'backend/drizzle/meta/_journal.json'),'utf8'));
 expect(oldJournal.entries).toHaveLength(105);expect(oldJournal.entries.at(-1).tag).toBe('0130_legacy_source_ownership');
 expect(await readFile(join(oldProducerRoot,'backend/src/schema/settings.ts'),'utf8')).not.toContain('assistantExecutionEngine');
 execFileSync(process.execPath,[join(oldProducerRoot,'ai-worker/scripts/build.mjs')],{cwd:join(oldProducerRoot,'frontend'),stdio:'pipe',timeout:1200000});
},3300000);
afterAll(async()=>{if(oldProducerRoot)await rm(oldProducerRoot,{recursive:true,force:true});},180000);


it('真实旧source仅私有准备和模块装载',async()=>{const loaded=await import(pathToFileURL(oldProducerModule).href);expect(typeof loaded.produce).toBe('function');console.log('OLD_PREPARATION_BOUND',oldProducerRoot);},180000);
