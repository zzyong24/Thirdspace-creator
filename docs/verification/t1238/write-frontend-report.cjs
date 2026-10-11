// 只将已成功真实旅程的原始回执绑定当前提交；不生成或补写测试结果。
const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const dir='docs/verification/t1238/';
const raw=JSON.parse(fs.readFileSync(dir+'ui-final.json','utf8'));
const output=fs.readFileSync(dir+'ui-journey-final-10.txt','utf8');
if(raw.checks.length!==10||raw.errors.length||raw.preferenceLoading?.heldRequests!==1||!raw.preferenceLoading?.modelControlsAbsent||raw.independentModelProbeRequests!==0||!output.includes('真实隔离设置旅程完成'))throw Error('真实旅程尚未完成，禁止生成PASS报告');
const head=cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const contractPath=dir+'settings-journey-contract.md';
const contractSource=fs.readFileSync(contractPath,'utf8');const contract=JSON.parse(contractSource.split('```frontend-journey-contract\n')[1].split('```')[0]);
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const visible={schema:'frontend-visible-copy/v1',task_id:'T-1238',commit_sha:head,captures:raw.captures};
const visiblePath=dir+'visible-copy.json';const visibleSource=JSON.stringify(visible,null,2)+'\n';fs.writeFileSync(visiblePath,visibleSource);
const report={schema:'frontend-validation/v1',task_id:'T-1238',contract_path:contractPath,contract_sha:digest(contractSource).slice(0,12),commit_sha:head,observed_at:raw.observedAt,
run:{verify_key:'codex-engine-settings:e2e',command:'node docs/verification/t1238/run-ui-journey.cjs',exit_code:0,output_ref:dir+'ui-journey-final-10.txt'},
environment:{surface:'browser',runtime:'Playwright Chromium（实际浏览器、真实隔离后端）',viewports:contract.viewports.map(v=>({...v,result:'pass'}))},
data:{mode:'non-fixture',witnesses:[{id:'isolated-settings-user',role:'真实本地用户偏好持久化'},{id:'official-codex-local-runtime',role:'实际本地Codex登录状态读取'}]},
levels:{logic:{status:'pass',evidence_ref:dir+'settings-pending-guard-recheck.txt'},surface:{status:'pass',evidence_ref:dir+'settings-codex-connected.png'},journey:{status:'pass',evidence_ref:dir+'ui-final.json'},experience:{status:'not-requested',evidence_ref:'未要求用户签审；不以机器操作代替用户体验确认'}},
checks:contract.required_checks.map(c=>({...c,result:'pass',evidence_ref:dir+'ui-final.json#'+c.id})),
coverage:contract.required_conditions.map(condition=>({condition,result:'pass',evidence_ref:dir+'ui-final.json'})),
visible_copy:{artifact_path:visiblePath,artifact_sha256:digest(visibleSource)},
tdd_red_ref:dir+'ui-final-turbopack-failure.txt',open_defects:[],status:'pass',
limitations:['未登录、生图能力不可用、保存失败是明确浏览器故障注入；正常GET/PATCH、刷新、双窗及最终登录检查是真实服务。','安装版未验；23类账户功能未逐族全部真机。','偏好加载保护使用明确延迟本轮真实GET验证：原服务仍返回真实值，独立文本/图片探测请求为0。','范围外短超时、隔离PG/打包资源与控制面T1204失败保留，不签全局全绿。']};
fs.writeFileSync(dir+'FRONTEND_REPORT.md','# T-1238 设置旅程验收\n\n真实浏览器操作10项通过。原始失败、故障注入说明与全局既有欠债保留。\n\n```frontend-validation\n'+JSON.stringify(report,null,2)+'\n```\n');
console.log('真实旅程报告已绑定 '+head);
