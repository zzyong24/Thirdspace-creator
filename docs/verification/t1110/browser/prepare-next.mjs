// 只创建/tmp影子源码和隔离状态文件；不启动服务/浏览器，不读取用户数据/Cookie/profile。
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,readdirSync,existsSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url)),repo=resolve(process.env.T1110_REPO_ROOT??process.cwd());
const sourcePaths=['frontend/src/server/persistence-client.ts','frontend/src/features/platform-account/native-report-panel.tsx','frontend/src/features/platform-account/account-binding-panel.tsx','frontend/src/features/platform-account/account-group-manager.tsx','frontend/src/app/(creator)/accounts/works/page.tsx','backend/src/modules/platform-collection/platform-collection.service.ts','backend/src/modules/platform-account/membership-lock.service.ts','frontend/next.config.ts','frontend/src/components/shell/account-switcher.tsx','frontend/src/lib/http-transport.ts','frontend/src/app/api/v1/dispatch/route.ts','frontend/src/app/globals.css','frontend/src/styles/tokens.css','backend/src/modules/platform-account/account-group.service.ts','backend/src/modules/platform-collection/platform-collection.transport.ts','contract/src/resources/platform-native-reports.ts'];
const git=(args)=>execFileSync('git',args,{cwd:repo,encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024}).trim();
const head=git(['rev-parse','HEAD']);if(git(['status','--porcelain=v1','--',...sourcePaths]))throw Error('旅程涉及的产品源码尚有未提交改动；先提交并冻结实际源码，不能用HEAD影子副本代签当前树');
const root=mkdtempSync(join(tmpdir(),'creatoros-t1110-shadow-')),shadow=join(root,'source');mkdirSync(shadow);
execFileSync('git',['archive','--format=tar',`--output=${join(root,'source.tar')}`,head],{cwd:repo,timeout:120000});execFileSync('tar',['-xf',join(root,'source.tar'),'-C',shadow],{timeout:120000});
const packages={backend:'backend',contract:'contract','ai-worker':'ai-worker'};
for(const directory of ['', 'frontend','backend','contract','ai-worker']){
 const from=join(repo,directory,'node_modules'),to=join(shadow,directory,'node_modules');if(!existsSync(from))continue;mkdirSync(to,{recursive:true});
 for(const entry of readdirSync(from)){if(entry==='@creatoros'){mkdirSync(join(to,entry),{recursive:true});for(const name of readdirSync(join(from,entry)))symlinkSync(packages[name]?join(shadow,packages[name]):join(from,entry,name),join(to,entry,name),'dir');}else symlinkSync(join(from,entry),join(to,entry),'dir');}
}
const target=join(shadow,'frontend/src/server/persistence-client.ts'),before=readFileSync(target,'utf8');
const marker='const platformCollection = createPlatformCollectionTransport(() => platformCollectionService, {';
if(before.split(marker).length!==2)throw Error('当前composition注入位置已变动，请root核对后修改影子准备器');
const injection=`const t1110PageFixture=(await import("../../tests/__t1110-service-fixture")).createT1110PageServiceFixture({real:platformCollectionService,groups:accountGroupService,accounts:platformAccountService});\n  const platformCollection = createPlatformCollectionTransport(() => t1110PageFixture, {`;
const after=before.replace(marker,injection).replace('afterCollectionStart: scheduleXhsCollection,','afterCollectionStart: undefined,').replace('afterCollectionGet: scheduleXhsCollection,','afterCollectionGet: undefined,');
writeFileSync(target,after);mkdirSync(join(shadow,'frontend/tests'),{recursive:true});copyFileSync(join(here,'service-fixture.ts'),join(shadow,'frontend/tests/__t1110-service-fixture.ts'));
const control=join(root,'fixture-control.json'),fixtureLog=join(root,'fixture-calls.ndjson');writeFileSync(control,JSON.stringify({defaultMode:'running',accounts:{}}));writeFileSync(fixtureLog,'');
if(after.includes('afterCollectionStart: scheduleXhsCollection,')||after.includes('afterCollectionGet: scheduleXhsCollection,'))throw Error('隔离执行hook未完整禁用');
const sourceWitness=sourcePaths.map(path=>({path,sha256:createHash('sha256').update(readFileSync(join(repo,path))).digest('hex')}));
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest={schema:'t1110-shadow-composition/v1',repo,head,root,shadow,control,fixtureLog,sourceWitness,injection:{path:'frontend/src/server/persistence-client.ts',beforeSha256:sha(before),shadowAfterSha256:sha(after),changedPorts:['platformCollection.listCapabilities','platformCollection.listNativeReports','platformCollection.start/status/cancel'],disabledHooks:['afterCollectionStart','afterCollectionGet'],platformBindingProof:'unchanged; no fake binding row/verified identity/profile'},evidenceScope:'完整Next路由/SSR/正式组件/真实公共账号组数据；报告read和执行状态为隔离fixture，不能认证平台或证明真实采集'};
writeFileSync(join(root,'shadow-manifest.json'),JSON.stringify(manifest,null,2)+'\n');process.stdout.write(`${join(root,'shadow-manifest.json')}\n`);
