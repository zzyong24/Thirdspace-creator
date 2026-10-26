# SPEC Review — current

- Task: T-1418
- Verdict: PASS
- Round: 3/3 (recheck)
- Spec receipt: ef85c40205fd
- Review receipt: 3031950757b1

## 当前有效问题

当前无未销账问题。

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1418",
  "cycle": 1,
  "round": 3,
  "max_rounds": 3,
  "review_kind": "recheck",
  "verdict": "PASS",
  "summary": "PASS，仅限 T-1418 后台空闲轮询增量规格审核，不代表实现、安装 CPU 或总览 P95 已通过。当前 SPEC SHA256=ef85c40205fd8dd1c78700a23dbc4cb9f20692396145a3fb16c52a189291c582；宪法 docs/产品定位.md SHA256=86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800；任务包 SHA256=7e7ab48e0bfa15d7be84ccfeb0398dacba45a9779550d1b2281208d540f08787。已读任务包 §1–5/7–9，写前核 §6；reviewctl context 的上一轮为 round2 PASS、findings=[]，本次为正常 round3 recheck，审核新增 SPEC 第33–41行，不继承旧结论替本改动背书。installed-idle-query-summary.json SHA256=85a568084fac34c87f117141875b9ebfe09ae392c2a866a8a3b6ab3d60652d2c 中两类 claimNext 分别22次/8946.417ms和6次/2436.665ms，合计28次/11383.082ms；记录是脱敏 SQL 形状及耗时，采样扰动下的累计耗时只支持定位，不能当作无调试的 CPU 占比或端点 P95。idle-queue-probe-before.json SHA256=0144fd921efb3f330e236e9e649f2f19f39b97c888cc4278dc8d6ee44844ae9f 确含301条任务、每条历史 payload 276044字节；实际计划返回0行、过滤300行、923 Shared Hit Blocks，Execution Time=16.046ms，外层 durationMs=25.154，二者未混用。原 persistent-task.service.ts:296–303 的 claimableAt 将 JSON 存在检查与状态等并列，:831–841 又独立附加六类 modelInput.kind 谓词；实际计划把 payload 检查放在 status 之前，与本次根因一致。SPEC:39 已约束无 payload 资格满足后才在 CASE 中检查 __scheduledChild 和 modelInput.kind，能针对该缺陷，不靠调整轮询频率或删除历史。落实时两类 payload 谓词均须受 CASE 分支保护，不能把 mode JSON 条件留在 CASE 外；保持原模式白名单及未指定模式、kinds 空列表、用户/账号/组排除、优先级/创建时间/ID 排序。共享 claimableAt 同时用于 claimNext 的候选/CAS 与 claimTask 的快照/CAS，CASE 只改变求值顺序，必须保留原 SQL TRUE/NULL 过滤结果、retryAt<=stamp、deadlineAt>stamp、升级任务及受保护子任务拒绝；后续归属校验、租约、fenceToken、attempt 与事务均仍按原源码，不改变数据归属或授权范围。测试写集足够覆盖该窄改动：当前新增隔离 fixture 已使用有界批次插入300条大 payload 终态任务，捕获真实 service SQL 并对六模式 EXPLAIN；资格矩阵覆盖未来重试/过期/升级/受保护子任务、优先级及其它 model 白名单，既有并发唯一赢家、精确属主排除、连续任务原 ID/attempt 回收等用例继续保留。固定301条 fixture 的 blocks<100 是访问量回归守卫，不能单凭该总计把任意环境零 TOAST 访问写成已证；应结合 CASE 实际计划、空返回和原数据仍保全解释。当前 diff 仅新增测试，生产 helper 尚未修改；本次未执行测试，不预签其 RED/GREEN。精确生产写集为 persistent-task.service.ts 及同名测试，无索引、迁移、缓存或公开契约扩张。SPEC 明确保留真实 RED→GREEN、原资格/并发/归属/fence/attempt 回归、静态门及新安装 CPU/CLI/页面 P95 验收；0c2877020 的既有慢次不销账，仍按产品定位 §16 普通读500ms/组合页1s与原平台/视口采样要求验收，未达标继续修复。本轮仅只读审查并写本报告，未执行 SQL、业务、网络、构建或安装，未改产品/控制面。",
  "spec_path": "docs/features/t1418-creator-overview-read-performance.md",
  "spec_sha256": "ef85c40205fd8dd1c78700a23dbc4cb9f20692396145a3fb16c52a189291c582",
  "constitution_path": "docs/产品定位.md",
  "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
  "review_path": "docs/features/t1418-creator-overview-read-performance.T-1418.review.md",
  "review_mode": "independent-agent",
  "model": "inherited",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "2196ccfdb8a7353265ca74779d577fbe31c3151b9996b481c2c264d00e739734",
  "open_findings": [],
  "resolved_findings": [],
  "receipt": "3031950757b1"
}
```
