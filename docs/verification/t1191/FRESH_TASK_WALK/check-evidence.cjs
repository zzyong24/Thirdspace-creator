const fs=require('fs');
const root=__dirname;
const log=JSON.parse(fs.readFileSync(root+'/receipt.json','utf8')).log;
const ranges=[
  {name:'prepare-second-keyboard-wide',indices:[32,34,44,53],kind:'editorTarget'},
  {name:'prepare-narrow',indices:[104,107,109],kind:'editorTarget'},
  {name:'creation-second-keyboard-wide',indices:[80,88,97],kind:'creationTarget'},
  {name:'creation-narrow',indices:[114,116,119],kind:'creationTarget'},
];
const results=ranges.map(r=>{
  const e=r.indices.map(i=>log[i].result);const last=e.at(-1);const call=last.postCalls[0];
  const expected=r.kind==='editorTarget'?last.target:last.creationTarget;
  return {name:r.name,receiptLogIndices:r.indices,postCounts:e.map(v=>v.postCalls.length),oneSubmission:last.postCalls.length===1,originalText:last.originalText,actualText:call.body.messages[0].parts[0].text,originalTextEqual:call.body.messages[0].parts[0].text===last.originalText,targetKind:r.kind,originalTarget:expected,actualTarget:call.body.chatContext[r.kind],targetEqual:JSON.stringify(expected)===JSON.stringify(call.body.chatContext[r.kind]),creationSubmission:last.creationSubmission,blockedNetwork:last.blockedNetwork};
});
const summary={scope:'真实React/SDK组件隔离页，最终fetch固定503；只核验到fetch边界，不代表真实后端/模型/持久任务成功',results,unknown:{receiptLogIndex:56,postCount:log[56].result.postCalls.length,originalText:log[56].result.originalText,receiptAbsent:true,verifyOriginalActionDisabled:true},zoom:{method:'真实Chrome普通私有profile的chrome://settings/appearance网页缩放select，值2即200%',settingReceiptLogIndices:[123,227,228,229],hostMetricsReceiptLogIndices:[126,157,170,184,197],noCSSScale:true,noDPRSimulation:true},verdict:{prepare:'窄范围通过',creation:'窄范围通过',unknown:'保留输入和不自动重提已观察；无原会话回执，核对动作未验，不能标全任务PASS',global200:'两个视口的关键键盘动作可达；prepare原生滚轮可达完整composer，creation宽窗原生滚轮可达composer；creation窄窗的wheel-only完整底部未证实'},unverified:['真实保存页及保存完成','真实设置页','真实模型生成成功','真实后端任务接收/会话回执/原请求核对','真实持久任务恢复成功','上传及附件恢复（未上传）','creation窄窗200%仅靠滚轮到完整底部']};
fs.writeFileSync(root+'/summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({bodyChecks:results.map(x=>({name:x.name,postCounts:x.postCounts,originalTextEqual:x.originalTextEqual,targetEqual:x.targetEqual})),summary:root+'/summary.json'},null,2));
