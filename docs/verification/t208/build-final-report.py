from pathlib import Path
import json,hashlib,os,re
out=Path('docs/verification/t208');root=Path('/Users/zyongzhu/Workbase/Thirdspace-growth/docs/build/T-188-validation/completion');sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
freeze=json.loads((out/'final-source-freeze.json').read_text());names=['green-focused','original30','original170','related','backend-typecheck','boundary','reconcile'];runs={n:json.loads((out/('final-'+n+'-exit.json')).read_text())for n in names};log=(out/'final-reconcile.log').read_text();counts={k:len(re.findall(r'\['+k+r'\]',log))for k in ['ERROR','WARN','OK']};errors=[l for l in log.splitlines()if'[ERROR]'in l];warnings=[l for l in log.splitlines()if'[WARN]'in l]
preservation=json.loads((out/'final-preservation.json').read_text());initial=json.loads((out/'original170-exit.json').read_text());assert runs['original170']['failed_titles']==initial['failed_titles'];assert runs['related']['exit_code']==0;assert runs['backend-typecheck']['exit_code']==0
source=freeze['frozen_source_sha256'];diff=root/'t208-final-implementation.diff';assert all(sha(f)==h for f,h in source.items());assert all(preservation['protected_old_dirty_byte_equal'].values());assert all(all(d.values())for d in preservation['old_control_objects'].values())
evidence={str(p.resolve()):{'sha256':sha(p),'mode':oct(p.stat().st_mode&0o777)}for p in out.glob('final-*')if p.is_file()}
worker={'source_sha256':sha('ai-worker/src/execution/transcribe-worker-run.ts'),'bundle_sha256':sha('ai-worker/dist/execution-worker.cjs'),'bundle_hash_capture':'实际最后reconcile守卫同源构建之后；不冒称首轮运行前已存二进制fingerprint'}
j={'head':freeze['head'],'node':freeze['node'],'source_sha256':source,'diff_sha256':sha(diff),'final_checks':runs,'reconcile':{'exit_code':runs['reconcile']['exit_code'],'counts':counts,'errors':errors,'warnings':warnings},'original_170_failures_same_as_initial':True,'original_30_case_bodies_byte_equal':True,'original_24_integration_cases_preserved':True,'protection':preservation,'worker':worker,'evidence':evidence,'maintenance_status':'实现与本任务专项恢复通过，整体工程门仍失败；待Root独立最终核准窄提交/complete','ui_install_uat_status':'未在本任务执行，真实Host及步骤表回读不能替代UI/安装版/线上UAT','other_scope':'T210/T211/T213/Mother partial wire均未实施'}
body='''# T208 最终实现与真实验证

唯一 Host 修复补齐原图集分类汇总和已确认后处理 applied/reason 步骤说明。初版固定 summary ID 的同 execution 公开 retry 缺口已先真实 RED；精确获准 summary-only 修正保初代 ID、后续锁内 attempt 后缀及历史排序，同代终态回放不新增。原 source/store 编号、owner/workspace/fence、账本、正文、deadline admission/settlement 区分和公共状态/wire 未改。

最终 Node v25.9.0、maxWorkers=1、retry=0、原 timeout。原两标题先 RED 2FAIL，初版聚焦20PASS；新增 retry 真实 RED 1FAIL 保在 summary-retry-typed-red.*，首次新增 tuple 类型诊断和修正后 typed RED 分开保留。最终聚焦22PASS/0FAIL：原目标2、新Worker1、新Host19，标题筛选未执行52不计通过。attempt2 summary 实际 CHECK 插入失败时两表/receipt/旧汇总及工件版本全回滚；去准确故障后原键恢复，同代 complete 深回读相同，零新供应商请求。

| 实际集合 | 原库存 | 本任务新增 | 结果 |
| --- | --- | --- | --- |
| 原30 | 21PASS / 9FAIL / 0skip | Worker1PASS | exit1 |
| 原170五文件 | 161PASS / 9FAIL / 0skip | Worker1PASS | exit1 |
| postprocess/ledger/worker相关10文件 | 113PASS / 0FAIL / 0skip | Host19PASS | 132PASS、exit0 |
| backend typecheck | — | — | exit0 |
| boundary原门 | — | — | exit1；7违规，登记基线5，额外2条本轮前相同Copilot SDK import |

原30 testcase body逐字相等，原24 integration case未改；只新增明确 import 和默认保持原行为的 optional extraIds fixture。原170的9个失败标题与初版完全相同；#8合法性、冷却、partial与退役fixture等其它任务未借T208改预期或生产。各集合重叠，不能将这些数字相加称总独立覆盖。

'''
body+=f"原 reconcile 最终真实 exit{runs['reconcile']['exit_code']}：{counts['ERROR']}ERROR / {counts['WARN']}WARN / {counts['OK']}OK。完整输出、原错误及SHA见同名JSON和私有日志。LED052缺显式隔离PG配置保持未通过，未查询其它库、获取未知role/secret或重启服务；LED018桌面浏览器门与历史receipt/manifest控制债原样保留。未忽略错误、更新baseline或改门。仅按主控精确授权记录生成telemetry SHA后恢复原缓存字节，原finding/status/receipt未写。\n\n"
body+='''旧 Mother、AGENTS、T915正式审核事件/packet、旧dirty全文逐字保护；DEC/events旧前缀、BACKLOG旧行以及去T208后的modules/progress对象均相同，旧summary/stage不变。ID_REGISTRY任务前干净，以HEAD全文前缀证明仅新增T208行。原context首次缺binding exit2保留，经授权仅新增任务binding后真实compile0。全部raw证据目录0700、文件0600，未stage旧控制或备份。

本任务只实际验证真实合成 Host/Worker/事务和步骤表回读，未执行主UI、安装版或线上UAT；不声明整仓、整体T188或生产验收通过。当前未commit/complete，交Root独立核准确写集及最后结果后裁决。本报告不授T210/T211/T213或Mother partial wire实现权。

源码及完整diff：`t208-final-source.json`、`t208-final-implementation.diff`、`t208-final-write-set.json`。最终 freeze及每条命令/完整测试JSON/exit/raw日志：Creator `docs/verification/t208/final-*`；初版及两类RED保原独立文件。准确SHA和保护证明均在本报告同名JSON。
'''
for p,data in [(root/'t208-final-verification.json',json.dumps(j,ensure_ascii=False,indent=2)+'\n'),(root/'t208-final-verification.md',body),(out/'REPORT.md',body)]:p.write_text(data);os.chmod(p,0o600)
print(json.dumps({'counts':counts,'report':str(root/'t208-final-verification.md'),'json_sha256':sha(root/'t208-final-verification.json'),'report_sha256':sha(root/'t208-final-verification.md'),'worker':worker},ensure_ascii=False,indent=2))
