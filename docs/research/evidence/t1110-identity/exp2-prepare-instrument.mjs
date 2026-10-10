import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const repo='/Users/zyongzhu/.codex/worktrees/wechat-stats-evidence/Thirdspace-creator';
const shadow='/var/folders/0f/yn6rgq1j2lj2n8_868n28jzc0000gn/T/creatoros-t1110-shadow-caV4uV/source';
const candidate='/tmp/t1110-identity-diagnostic-candidate';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(fs.readFileSync('/tmp/t1110-identity-diagnostic-candidate-manifest.json','utf8'));
const inventory=[];
for(const item of manifest.files.filter(x=>!x.path.endsWith('.test.ts'))){
 const original=fs.readFileSync(path.join(repo,item.path));
 if(hash(original)!==item.baseline_sha256)throw Error('正式source漂移');
 const prepared=fs.readFileSync(path.join(candidate,item.path));
 if(hash(prepared)!==item.candidate_sha256)throw Error('可丢弃候选漂移');
 fs.writeFileSync(path.join(shadow,item.path),prepared);
 inventory.push({path:item.path,productionSha256:item.baseline_sha256,candidateSha256:hash(prepared)});
}
const comp='frontend/src/server/persistence-client.ts';let content=fs.readFileSync(path.join(repo,comp),'utf8');
const original='collectReports:async options=>{await wechatSource.collectNativeReports(options.platform,options.directory,options.expectedPlatformIdentity,{signal:options.signal,deadlineAt:new Date(options.deadlineAt).toISOString(),onStopped:options.onStopped,onStopUnconfirmed:options.onStopUnconfirmed,onDiagnostic:event=>console.warn(\'[wechat-native-report]\',event)},report=>options.onReport({...report,platform:options.platform}));},';
if(content.split(original).length!==2)throw Error('正式collectReports接缝必须唯一');
const replacement=`collectReports:async options=>{
      // 仅/tmp研究候选：正常profile authority/租约/原signal/deadline，身份后停止，无报表。
      const mark=async(event:string,detail:Record<string,unknown>={})=>{try{const log=process.env.T1110_IDENTITY_RESEARCH_LOG;if(!log)throw Error('未配研究日志');await(await import('node:fs/promises')).appendFile(log,JSON.stringify({schema:'t1110-identity-probe/v1',at:new Date().toISOString(),attemptId:options.attemptId,event,...detail})+'\\n');}catch{console.warn('[t1110-identity-research] fixed-log-write-failed');}};
      await mark('profile-authorized-and-acquired');
      try{
        await wechatSource.readIdentity(options.platform,options.directory,options.expectedPlatformIdentity,{
          signal:options.signal,deadlineAt:new Date(options.deadlineAt).toISOString(),
          onStopped:async()=>{await options.onStopped();await mark('physicalStopConfirmed');},
          onStopUnconfirmed:retry=>{options.onStopUnconfirmed(retry);void mark('stopUnconfirmed');},
          onDiagnostic:event=>{console.warn('[t1110-identity-research-diagnostic]',event);void mark('diagnostic',{diagnostic:event});},
        });
        await mark('identityHealthy');
      }catch(error){await mark('identityRejected');throw error;}
      await mark('researchActiveStop');
      throw Error('RESEARCH_IDENTITY_ONLY_STOP');
    },`;
content=content.replace(original,replacement);fs.writeFileSync(path.join(shadow,comp),content);
inventory.push({path:comp,productionSha256:hash(fs.readFileSync(path.join(repo,comp))),candidateSha256:hash(content),change:'only collectReports delegates readIdentity then fixed stop; no reports fixture, no capability/proof alteration'});
// 仅/tmp定位用：固定布尔协议，未打印原message/stack/URL/正文/身份。
const source=path.join(shadow,'ai-worker/src/runtime/platform/wechat-browser-source.ts');let browser=fs.readFileSync(source,'utf8');
const needle='  }catch(error){\n   emitDiagnostic(controls,platform,trace,error);';
if(browser.split(needle).length!==2)throw Error('withProfile catch必须唯一');
const instrument=`  }catch(error){
   console.warn('[t1110-identity-research-protocol]',{schema:'t1110-fixed-sdk-protocol/v1',stage:trace.stage,identityStep:trace.stage==='readIdentity'?trace.identityStep:undefined,sdkEvaluate:error instanceof Error&&/^(?:page|frame)\\.evaluate(?:Handle)?:/.test(error.message),nameHelperUndefined:error instanceof Error&&/(?:ReferenceError: )?__name is not defined(?:\\n|$)/.test(error.message),executionContextDestroyed:error instanceof Error&&error.message.includes('Execution context was destroyed'),javascriptReferenceError:error instanceof Error&&/^(?:page|frame)\\.evaluate(?:Handle)?: ReferenceError:/.test(error.message)});
   emitDiagnostic(controls,platform,trace,error);`;
browser=browser.replace(needle,instrument);fs.writeFileSync(source,browser);
inventory.find(x=>x.path.endsWith('wechat-browser-source.ts')).researchInstrumentedSha256=hash(browser);
fs.writeFileSync('/tmp/t1110-identity-exp2-source-manifest.json',JSON.stringify({preparedAt:new Date().toISOString(),repo,shadow,experiment:'EXP-2 planned not executed',files:inventory,notes:['same original dataRoot, no credentials transferred','public nativeCollector authority and deadline remain','identity-only stop before report APIs','candidate GREEN/type NOT_RUN','fixed SDK booleans additional research-only instrumentation, absent production candidate']},null,2)+'\n');
console.log(JSON.stringify({prepared:true,files:inventory,productionUnchanged:true},null,2));
