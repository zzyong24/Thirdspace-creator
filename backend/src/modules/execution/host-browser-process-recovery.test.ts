import {expect,it} from 'vitest';
import {createDesktopHostProcessRecovery,type HostProcessRecord} from './host-browser-process-recovery';
const self:HostProcessRecord={pid:10,started:'2026-09-14T01:00:00',executable:'/runtime/1.2.0/sidecar/server.app/Contents/MacOS/creatoros-server',command:'next-server (v16.2.9)'};
const profile='/test/抖音 数据/account';
const fixture=(rows:HostProcessRecord[]=[])=>createDesktopHostProcessRecovery({pid:10,platform:'darwin',desktop:true,snapshot:async()=>[self,...rows]});
it('真实安装宿主且旧UUID宿主/档案进程均不存在才允许恢复',async()=>{
 const p=fixture();expect(await p.isPreviousHostStopped({hostInstanceId:'old-uuid',authDir:profile})).toMatchObject({stopped:true});
 expect(await p.createHostInstanceId()).toMatch(/^host-v1:10:/);
});
it.each([
 {pid:11,started:'old',executable:'/old/creatoros-server',command:'next-server (v16)'},
 {pid:12,started:'old',executable:'/bin/node',command:'node /runtime/server.js'},
 {pid:13,started:'old',executable:'/Google Chrome',command:`Chrome --user-data-dir=${profile} --headless`},
 {pid:14,started:'old',executable:'/Google Chrome',command:null},
])('不能抢占其他宿主/目标档案进程或无法读取的浏览器 %j',async row=>{
 expect(await fixture([row]).isPreviousHostStopped({hostInstanceId:'old-uuid',authDir:profile})).toMatchObject({stopped:false});
});
it('当前PID仍有相同启动身份时不恢复，PID已复用则按已停止处理',async()=>{
 const old={...self,pid:11,started:'before'};
 const owner=createDesktopHostProcessRecovery({pid:11,platform:'darwin',desktop:true,snapshot:async()=>[old]});
 const id=await owner.createHostInstanceId();
 expect(await fixture([old]).isPreviousHostStopped({hostInstanceId:id,authDir:profile})).toMatchObject({stopped:false});
 expect(await fixture([{...old,started:'after',executable:'/usr/bin/unrelated',command:'unrelated'}]).isPreviousHostStopped({hostInstanceId:id,authDir:profile})).toMatchObject({stopped:true});
});
it('进程查询报错和非安装宿主都无法提供停止证据',async()=>{
 const p=createDesktopHostProcessRecovery({pid:10,platform:'darwin',desktop:true,snapshot:async()=>{throw Error('permission');}});
 expect(await p.isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
 expect(await createDesktopHostProcessRecovery({pid:10,platform:'darwin',desktop:false,snapshot:async()=>[self]}).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
});
it('相似前缀与其他账号档案不能混为一个目录',async()=>{
 expect(await fixture([{pid:12,started:'old',executable:'/Google Chrome',command:`Chrome --user-data-dir="${profile}-other" --headless`}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
});
it('Windows完整路径、引号、大小写归一后识别目标档案占用',async()=>{
 const p=createDesktopHostProcessRecovery({pid:10,platform:'win32',desktop:true,snapshot:async()=>[{...self,executable:'C:\\CreatorOS\\creatoros-server.exe'},{pid:20,started:'old',executable:'C:\\Chrome\\chrome.exe',command:'chrome.exe --user-data-dir="C:\\Users\\User\\抖音 数据" --headless'}]});
 expect(await p.isPreviousHostStopped({hostInstanceId:'old',authDir:'c:\\users\\user\\抖音 数据'})).toMatchObject({stopped:false});
});
it('伪造/损坏的新宿主身份不能退回旧UUID恢复分支',async()=>{
 expect(await fixture().isPreviousHostStopped({hostInstanceId:'host-v1:invalid',authDir:profile})).toMatchObject({stopped:false,reason:'host-identity-invalid'});
});
it('新宿主停止但遗留同档案Chromium仍运行，保持原租约',async()=>{
 const id=await createDesktopHostProcessRecovery({pid:11,platform:'darwin',desktop:true,snapshot:async()=>[{...self,pid:11}]}).createHostInstanceId();
 const p=fixture([{pid:20,started:'old',executable:'/Chromium',command:`Chromium --user-data-dir="${profile}" --no-first-run`}]);
 expect(await p.isPreviousHostStopped({hostInstanceId:id,authDir:profile})).toMatchObject({stopped:false,reason:'profile-browser-running'});
});
it('同PID缺失启动信息不能被当作已退出',async()=>{
 const id=await createDesktopHostProcessRecovery({pid:11,platform:'darwin',desktop:true,snapshot:async()=>[{...self,pid:11}]}).createHostInstanceId();
 expect(await fixture([{...self,pid:11,started:''}]).isPreviousHostStopped({hostInstanceId:id,authDir:profile})).toMatchObject({stopped:false});
});
it('同进程多次装配，即使曾查询失败降级UUID，也不能把活owner当跨重启旧宿主',async()=>{
 const old=createDesktopHostProcessRecovery({pid:10,platform:'darwin',desktop:true,snapshot:async()=>{throw Error('temporary');}});
 const identity=await old.createHostInstanceId();expect(identity).not.toMatch(/^host-v1:/);
 expect(await fixture().isPreviousHostStopped({hostInstanceId:identity,authDir:profile})).toMatchObject({stopped:false,reason:'current-process-owner'});
});
it('当前宿主刚启动的受控worker不是旧宿主，但其目标档案浏览器仍阻止恢复',async()=>{
 const worker={...self,pid:30,ppid:10};
 expect(await fixture([worker]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
 expect(await fixture([worker,{pid:31,ppid:30,started:'now',executable:'/Chrome',command:`Chrome --user-data-dir=${profile} --headless`}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
});
it.each(['Chrome --user-data-dir=/test/?? --headless','Chrome --user-data-dir=/test/account about:blank','Chrome --user-data-dir=/test/a --user-data-dir=/test/b'])('无法还原完整档案参数时保持占用：%s',async command=>{
 expect(await fixture([{pid:13,started:'old',executable:'/Chrome',command}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false,reason:'browser-profile-unverified'});
});
it('Next覆写进程标题时，仅自身真实execPath能证明正式宿主',async()=>{
 const rows=[{...self,executable:'next-server (v16.2.9)',command:'next-server (v16.2.9)'}];
 const current=createDesktopHostProcessRecovery({pid:10,execPath:self.executable,desktop:true,platform:'darwin',snapshot:async()=>rows});
 expect(await current.createHostInstanceId()).toMatch(/^host-v1:10:/);
 expect(await current.isPreviousHostStopped({hostInstanceId:'old-uuid',authDir:profile})).toMatchObject({stopped:true});
 expect(await createDesktopHostProcessRecovery({pid:10,execPath:'/bin/node',desktop:true,platform:'darwin',snapshot:async()=>rows}).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
});
it('同一sidecar根中正式CLI的完整mcp serve角色可排除，未知脚本和参数不能排除',async()=>{
 const executable='/Users/test/Library/Application Support/cloud.aitongban.creatoros/runtime/1.2.0/sidecar/server.app/Contents/MacOS/creatoros-server';
 const cli='/Users/test/Library/Application Support/cloud.aitongban.creatoros/runtime/1.2.0/sidecar/frontend/cli/creatoros.cjs';
 const row={pid:40,started:'old',executable,command:`${executable} ${cli} mcp serve`};
 expect(await fixture([row]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
 for(const command of [`${executable} /other/creatoros.cjs mcp serve`,`${executable} ${cli} unknown-role`,`${executable} --require /other/script.cjs ${cli} mcp serve`]){
  expect(await fixture([{...row,command}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
 }
});
it.each([
 {executable:'/Applications/Tool.app/Contents/node',command:'/Applications/Tool.app/Contents/node ./server.mjs'},
 {executable:'node',command:'node ./mcp/server.mjs'},
 {executable:'node',command:'node /workspace/node_modules/vitest/vitest.mjs run'},
 {executable:'node',command:'node /workspace/node_modules/tsx/dist/cli.mjs /tmp/probe.ts'},
])('明确工具入口不作为产品宿主：%j',async role=>{
 expect(await fixture([{pid:43,started:'old',...role}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
});
it.each(['node /runtime/server.js','node --use-bundled-ca /runtime/server.js','node /runtime/project/node_modules/next/dist/bin/next dev','node -e require("/runtime/private.js")'])('Next宿主和无法识别的动态入口仍阻止恢复：%s',async command=>{
 expect(await fixture([{pid:44,started:'old',executable:'node',command}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
});
it.each(['node --enable-source-maps -e require("/runtime/private.js")','node --import /runtime/unknown/loader.mjs /unknown/app.js','node --no-warnings --require /runtime/unknown/preload.cjs /unknown/app.js'])('已知flag后仍有未知代码加载选项保持占用：%s',async command=>{
 expect(await fixture([{pid:45,started:'old',executable:'node',command}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
});
it('明确Node环境文件配置后按实际入口判断，不把普通index.js服务当Next宿主',async()=>{
 expect(await fixture([{pid:46,started:'old',executable:'node',command:'node --env-file-if-exists=.env src/index.js'}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
 expect(await fixture([{pid:46,started:'old',executable:'node',command:'node --env-file=.env /runtime/server.js'}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
 expect(await fixture([{pid:46,started:'old',executable:'node',command:'node --env-file=.env --require /runtime/unknown.cjs src/index.js'}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
});
it('产品runtime完整路径边界内未知选项仍阻塞，相似名字的外部工程不形成全局锁',async()=>{
 expect(await fixture([{pid:47,started:'old',executable:'node',command:'node --import /runtime/1.1.0/sidecar/unknown.mjs app.js'}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:false});
 expect(await fixture([{pid:47,started:'old',executable:'node',command:'node --import /runtime-other/unknown.mjs app.js'}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
 expect(await fixture([{pid:47,started:'old',executable:'node',command:'node --env-file-if-exists=.env /another/project/index.js'}]).isPreviousHostStopped({hostInstanceId:'old',authDir:profile})).toMatchObject({stopped:true});
});
it('当前Next部署在装配业务前设置宿主标题，旧宿主候选闭集有源码依据',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../../../../frontend/node_modules/next/dist/server/lib/start-server.js',import.meta.url),'utf8');
 const title=source.indexOf('process.title = `next-server'),business=source.indexOf('const initResult = await getRequestHandlers');
 expect(title).toBeGreaterThan(0);expect(business).toBeGreaterThan(title);
});
