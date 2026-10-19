# T-1110 · 微信身份普通操作错误研究卡

任务状态只看BACKLOG。本新族是身份操作接缝，旧统计可见根族已闭合的历史、两个实验与CLOSE全部保留；本卡不重置旧额度。当前researching，两个verify_key尚未配置，不能恢复或称validated。

```research-first-gate/v2
{
  "schema": "research-first-gate/v2",
  "task_id": "T-1110",
  "research_task_id": "T-1110",
  "status": "researching",
  "problem_statement": "当前视频号公开collection62与公众号绑定83均readIdentity普通Error，未进入报表、0报告。粗诊断合并登录probe、账号导航、字段evaluate，现有证据不能区分首个失败接缝；83尚未收到本次人工扫码回复，不声称已扫码。",
  "failure_family": "wechat-identity-operation-error",
  "observed_invariant": "只有当前官方稳定身份读取成功且与归属核对后才能绑定/下载/入库；普通页面操作错误不能伪报登录过期或成功。未知身份操作错误必须先定位接缝，不用同样完整重跑恢复。",
  "trigger_kinds": [
    "repeated-failure-family",
    "high-cost-feedback-loop"
  ],
  "paused_actions": [
    "further-production-changes",
    "broadened-workaround",
    "repeated-full-system-runs",
    "irreversible-operations"
  ],
  "evidence": {
    "authoritative": [
      {
        "kind": "approved-spec",
        "ref": "docs/features/t1110-wechat-browser-collection.md",
        "claim": "FR01及AC01要求真实当前稳定身份，普通操作/导出失败不改成needsAuth。"
      },
      {
        "kind": "source-code",
        "ref": "ai-worker/src/runtime/platform/wechat-browser-source.ts",
        "claim": "identity先loginProbe再witness.read；login=true跳过probe；当前catch统一readIdentity且不回显异常原文。"
      },
      {
        "kind": "source-code",
        "ref": "ai-worker/src/runtime/platform/wechat-dom-witness.ts",
        "claim": "witness的普通账号goto及身份DOM evaluate当前共享粗阶段；isLoggedOut执行另一个evaluate。"
      }
    ],
    "local": [
      {
        "kind": "runtime",
        "path": "docs/verification/t1110/identity-operation-failure-20261010.json",
        "locator": "video/official/diagnostic",
        "observation": "两个真实公开原ID自然失败；具体子步骤及原SDK Error类别UNKNOWN，无新的登录过期证据。"
      },
      {
        "kind": "source-code",
        "path": "docs/verification/t1110/identity-failure-analysis-20261010.md",
        "locator": "哪些普通Error有源码依据",
        "observation": "独立核本机SDK1.60异常包装；Error不等于下载失败/登录掉线，不能确定是哪一个evaluate/goto。"
      },
      {
        "kind": "test",
        "path": "docs/verification/t1110/platform-binding-focus-verification-20261010.json",
        "locator": "red/green/led047",
        "observation": "先前页面焦点修正已独评/2RED/56GREEN/LED047174，属于本次OPEN前；当前不再继续生产实现或全旅程。"
      },
      {
        "kind": "test",
        "path": "docs/research/evidence/t1110-identity/preopen-exp1-metadata.json",
        "locator": "result/times/baseline_sha256",
        "observation": "已发生一次pre-OPEN探索计入本族1/2；独立agent暂停后无新增测试/类型/浏览器/服务执行。"
      },
      {
        "kind": "source-code",
        "path": "docs/research/evidence/t1110-identity/candidate-implementation.patch",
        "locator": "WechatIdentityStep/markIdentityStep/emitDiagnostic",
        "observation": "可丢弃固定诊断候选；未GREEN/type/生产合入，不可当真实身份失败已修复。"
      },
      {
        "kind": "runtime",
        "path": "docs/research/evidence/t1110-identity/exp2-sdk-fixed-protocol.json",
        "locator": "values",
        "observation": "同一EXP2已有私有固定协议日志，只读投影：四个SDK错误标志false，readIdentity/identityFields；不扩展为第三实验。"
      },
      {
        "kind": "runtime",
        "path": "docs/research/evidence/t1110-identity/exp2-cleanup-restoration.json",
        "locator": "restored",
        "observation": "正常停止研究宿主，全进程组0；恢复原正式源测试宿主，5公开读200，原任务/绑定及0报告保留。"
      }
    ],
    "experiments": [
      {
        "question": "原source能否区分loginProbe、identityNavigation、identityFields及固定SDK错误协议；仅合成Page/Context，不定位真实62/83。",
        "command": "pnpm exec vitest run src/runtime/platform/wechat-identity-diagnostic.test.ts --retry=0 --maxWorkers=1 --no-file-parallelism --testTimeout=180000 --hookTimeout=180000 > /tmp/t1110-identity-diagnostic-candidate-red.log 2>&1",
        "environment": "pre-OPEN可丢弃/tmp隔离镜像；正式source SHA与39dcfae6基线一致；无真实browser/profile/账号，进程精确起止未采样。",
        "result": "实际exit1，13FAIL/1PASS/14。旧source缺分段诊断；不是事前计划、不是正式共享生产RED，也不是真实根因。日志时间为创建/末写，不能冒称执行起止。",
        "artifact_path": "docs/research/evidence/t1110-identity/preopen-exp1-metadata.json",
        "artifact_sha256": "431e540d1e4a0c34984ae1980db2b8bf1f47056dfce95826cd2779da67259361",
        "pre_open": true,
        "experiment_id": "EXP-1"
      },
      {
        "experiment_id": "EXP-2",
        "question": "原已绑定视频号在正常受管profile身份读取的首个失败步骤/SDK固定类别；若健康仅证明当前身份核对成功，原62/83仍UNKNOWN。",
        "command": "node /tmp/t1110-start-identity-only-exp2.mjs；node /tmp/t1110-execute-identity-only-exp2.mjs（仅一次public start，之后同ID get）",
        "environment": "原隔离DB/profile、原authority和租约；Ego与原62/83未重发。宿主磁盘仪器修后未冷重启，旧composition闭包实际执行，全模块加载SHA未知。",
        "result": "实际failed/EXPORT_FAILED/0页/0报告；identityFields/IDENTITY_MISSING；原onStopped返回后marker；没有healthy/activeStop；仍UNKNOWN，非新磁盘GREEN/CLOSE。",
        "artifact_path": "docs/research/evidence/t1110-identity/exp2-result.json",
        "artifact_sha256": "00f5769ea58f12a4f95ee29f5d4a673a834dc80ac278ab8ebe76796dde0ae773",
        "pre_open": false,
        "run_started_at": "2026-10-10T04:46:10.617Z",
        "original_deadline_at": "2026-10-10T05:16:10.617Z"
      }
    ]
  },
  "options": [
    {
      "id": "OPT-1",
      "outcome": "把generic Error直接当会话过期、延长预算或改账号导航，并再完整扫码/采集。",
      "tradeoffs": "当前证据不足且增加人工成本；可能错清Cookie/误报需要登录。",
      "scope": "淘汰，不实施、不重发旧任务。",
      "falsified_by": "两个真实错误没有LOGIN_REQUIRED且登录probe/导航/字段未区分。"
    },
    {
      "id": "OPT-2",
      "outcome": "在可丢弃候选里仅加固定身份步骤与SDK协议分类，先验证诊断脱敏，再一次正常受管profile只读身份探针，下载前停止。",
      "tradeoffs": "不恢复真实报表承诺；原62/83根因保持UNKNOWN直到出现实际分段证据，预算最多2次。",
      "scope": "无共享生产合入、无凭据复制/手工篡改、新QR/报告与绑定业务写入；允许唯一明确研究intent自身租约、心跳、失败与停止审计。正常受管浏览器可更新其自己的会话文件，不承诺Cookie字节不变。原62/83状态与期限不改。原62/83根因只依实际分段证据，不由本次合成或主动stop代签。",
      "falsified_by": "候选改变auth结果/租约/信号/期限，输出敏感信息，或额外原生实验不能区分首个失败步骤时拒绝。"
    }
  ],
  "recommendation": "OPT-2",
  "validation": {
    "timebox_minutes": 120,
    "max_experiments": 2,
    "acceptance_criteria": [
      {
        "name": "区分当前首个身份失败接缝",
        "target": "实际受管原profile一次只读探针得到固定步骤及固定异常类别，或证明当前相同身份读取健康并保原62/83UNKNOWN。",
        "measurement": "候选固定phase日志，正常checkout与原身份守卫，任何prepare/download/commit前停止。",
        "observed": "EXP2 2/2已自然失败，固定字段段IDENTITY_MISSING；仍缺SDK/DOM/导航根因及完整加载SHA，原62/83 UNKNOWN，不能validated。",
        "verify_key": "t1110_wechat_identity_mechanism_pending",
        "evidence_path": "docs/research/evidence/t1110-identity/exp2-result.json",
        "evidence_sha256": "00f5769ea58f12a4f95ee29f5d4a673a834dc80ac278ab8ebe76796dde0ae773"
      },
      {
        "name": "诊断不改变任务与隐私边界",
        "target": "原失败/原ID/0报告保留；不改Cookie/用户身份/授权判断，不回显原文或扩大重试。",
        "measurement": "候选最小差异、固定枚举/secret-negative测试、源/门/私有工件绑定及独立复审。",
        "observed": "原62/83与报告0保留，有原onStopped返回后marker；旧异步仪器未通过运行验收，磁盘修后静态复核不等于执行。",
        "verify_key": "t1110_wechat_identity_boundary_pending",
        "evidence_path": "docs/research/evidence/t1110-identity/exp2-result.json",
        "evidence_sha256": "00f5769ea58f12a4f95ee29f5d4a673a834dc80ac278ab8ebe76796dde0ae773"
      }
    ],
    "resume_criteria": "两项项目验收key现场精确执行并独立完整CLOSE；保持旧section研究的OPEN/CLOSE/2实验不变。原62/83原因不能借合成诊断签PASS。前置仅暂停登记，不是validated。 两次额度已耗尽，保持OPEN；不得用重建或事后静态SHA补签。",
    "quota_exhausted": true
  },
  "decision_impacts": [
    "none"
  ],
  "decision_ids": [
    "DEC-WECHAT-1110-IDENTITY-EXTRA-PROBE"
  ],
  "experiment_plan": [
    {
      "id": "EXP-1",
      "status": "PRE_OPEN_RECORDED",
      "question": "已有诊断是否能区别实际三接缝与SDK异常类别；仅/tmp synthetic，不定位62/83真实根因。",
      "note": "精确command/实际exit/log/hash及日志时间已入卡；计入1/2。进程精确起止未知，不补拍。暂停后未重复合成。"
    },
    {
      "id": "EXP-2",
      "status": "EXECUTED_TERMINAL_FAILED",
      "question": "原已绑定视频号在正常受管profile身份读取的首个失败步骤/SDK固定类别；若健康仅证明当前身份核对成功，原62/83仍UNKNOWN。",
      "method": "可丢弃/tmp同HEAD源码镜像，仅应用固定诊断候选；复用正式公开dispatch/本机主用户解析、当前组账号、nativeCollector租约/心跳、authorizeBindingTarget及hostLifecycle.acquire。collectReports仅委托readIdentity，保原options signal/deadline/onStopped/onStopUnconfirmed；身份通过发私有固定HEALTHY marker后抛RESEARCH_IDENTITY_ONLY_STOP，任何prepare/download/parse/onReport/commit前停止。",
      "authority": "原隔离test根PGlite与平台目录，未复制研究/用户EgoCookie；预先核原62 failed0、83 failed/null、视频号原绑定succeeded，正常停止owned 31410并等待退出后用同dataRoot起可丢弃候选宿主。公开start只一次新research clientRequestId，不重用原62/83，不新QR、不操作Ego20/Page。scheduler和后台drivers关闭；手动同步走原collector入口。",
      "success_discriminator": "只能输出固定identityStep/failureKind/activeStop/physicalStopReceipt及布尔值；平台稳定ID/昵称/URL/正文不打印不提交。原onStopped完成后记receipt；停止不确认保原pendingMap与shutdownScope，不以进程数替代receipt。",
      "quota": "计本族第2/2；一次实验、一次intent，不自动重试。准备/类型静态检查不是运行，预备失败据实记录，不新增native猜测。",
      "timebox": "卡全体120分钟；每次公共HTTP请求最短120000ms，原任务deadline不续期；宿主启动480000ms并单独余量；探针观察停止后保原新intent实际终态。",
      "research_instrumentation": "另仅在可丢弃source withProfile catch输出固定SDK布尔：evaluate前缀、__name缺定义、context销毁、固定ReferenceError前缀。只看原Error协议、不输出message/stack/URL/身份；这段不属生产诊断候选。",
      "command": "node /tmp/t1110-start-identity-only-exp2.mjs；就绪后一次公开platforms.collections.start新research clientRequestId，再按同attempt get观察；详细命令与受控源码SHA保存。",
      "actual": {
        "attemptId": "collection-db52c710-52",
        "runStartedAt": "2026-10-10T04:46:10.617Z",
        "deadlineAt": "2026-10-10T05:16:10.617Z",
        "finalStatus": "failed",
        "committedPages": 0,
        "reports": 0,
        "runtimeVariant": "旧composition行为；运行全模块SHA UNKNOWN",
        "revisedDiskExecution": "NOT_RUN",
        "evidencePath": "docs/research/evidence/t1110-identity/exp2-result.json"
      }
    }
  ],
  "research_open": {
    "ts": "2026-10-10T04:35:11.005Z",
    "event_sha256": "34b87ed3d4b8faa4c498cdf7ed438bd574ce6a508fcbb83d7b7578e6eb96fd8d",
    "registration": "event-only non-official compatibility; taskctl block precedes; official observe actual exit2, audit exit0"
  },
  "pending_user_decision": {
    "id": "DEC-WECHAT-1110-IDENTITY-EXTRA-PROBE",
    "status": "AWAITING_USER",
    "proposal": "docs/research/t1110-identity-shape-extra-probe-proposal.md",
    "quotaOverrideNotGranted": true
  }
}
```

已证明：两个不同真实操作同粗identity阶段失败，当前诊断不足；尚未证明：哪个SDK/DOM/导航操作失败、83是否完成本次扫码、Cookie失效。新候选只作故障定位，不提供账号成功或数据采集证明。

故障定位范围：

```mermaid
flowchart LR
 A[核对当前组与账号归属] --> B[沿原租约打开受管登录环境]
 B --> C[检查明确登录提示]
 C --> D[进入普通账号信息页]
 D --> E[读取并核对稳定身份]
 E --> F[研究探针在此停止]
```

图中停止点先于报表下载与入库。原62、83保持原失败状态，不据合成测试推断Cookie失效。

2026-10-10实际补记：EXP2已使用最后一次额度并自然失败。字段读取接缝已定位，具体根因仍未确认。启动后改磁盘未更新进程缓存，是本轮取证限制；旧文件日志和修后候选分别留存，不补签通过。
