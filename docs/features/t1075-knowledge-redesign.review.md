# SPEC Review — current

- Task: T-1075
- Verdict: PASS
- Round: 1/3 (initial)
- Spec receipt: 68a07904e6ca
- Review receipt: b0f59286f80b

## 当前有效问题

| ID | 严重度 | 需求锚点 | 失败模式 | 来源 |
|---|---|---|---|---|
| REV-001 | minor | T-1075-USER | 既有knowledge.list transport目前把全部items作为data返回，仅在meta回显page/pageSize，没有切片；contract client与组合transport也不补分页。若新前端按每个请求一定只有100条循环，会重复请求并重复条目，或错误推断结束；如果照旧请求pageSize200则HTTP输入会违反max100。SPEC已有完整读取要求，实施时必须核对这一真实差异。 | baseline |
| REV-002 | minor | T-1075-SCOPE | createKnowledge当前仅校验当前workspace可写并直接透传folderId/assetId；repository创建时直接保存两个软引用，schema也没有外键或scope校验。移动资料已校验目标文件夹，但创建时若收到别组或不存在的folderId/assetId，可能生成挂在不可见文件夹或错误来源上的当前scope知识。仅前端从下拉框挑真实ID不足以证明SPEC的后台范围约束。 | baseline |

已销账：—

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1075",
  "cycle": 1,
  "round": 1,
  "max_rounds": 3,
  "review_kind": "initial",
  "verdict": "PASS",
  "summary": "结论PASS：本轮为独立SPEC首审，仅进行文档、契约、源码与调用图核验，不代表实现、浏览器、供应商或安装版通过。用户已选01资料书架并要求真实读写；SPEC与PAGE_SPEC覆盖当前scope真实knowledge读写、完整原文与追加版本、文件夹/归档、既有文件导入、materialLinks写后读和项目正文预览、主从clear、URL恢复与切scope防晚到回写；保留课程、经验、标签深链、高级关系视图与历史数据，不新增数据owner或AI能力。能力依据：contract/src/operations/knowledge.ts及material-links.ts提供既有操作；knowledge.repository.ts:500、541分别原子创建条目/首版本和追加新版本，旧版本不删除；knowledge-dump-zone.tsx:284-345已有上传完成、MD/TXT读取或material.extract原任务、assetId与来源落库链；persistence-client.ts:4277-4286实际绑定项目/知识/素材归属service；material-links.repository.ts:89-118在项目写锁内按projectId、contentOutputId、entityType、entityId、role、stage识别既有边。CodeGraph callers buildDraftWorkbenchVm确认项目page.tsx为实际消费入口，createKnowledge动态端口以transport/service源码核验。SPEC:23已明确修复稿面30条/12条截断与knowledge空预览，PAGE_SPEC watched_paths覆盖稿面装配与卡片。必须落实的BUILD条件沿已确认验收：合法100页预算完整集合、分页错误不能当空；当前revisionId与真实正文一致，编辑失败保留草稿；创建后读回同一ID与完整原文；导入保留原assetId和taskId、不自动重发，部分失败不丢成功项；相同固定role/stage引用重复操作只有一条边，稿面超过12/30条的历史引用仍可访问且按需读真实正文；不同实体和当前scope隔离、共享资源既有grant语义、空/错/慢/返回/刷新/重复均实测；两个正式视口、当场RED到GREEN、正式receipt及LED-047/超时/boundary/orphan/reconcile证据仍待BUILD。两项minor源码提醒如下；它们不增加产品范围或额外用户确认，也不允许仅靠前端隐藏取代后台约束。",
  "spec_path": "docs/features/t1075-knowledge-redesign.md",
  "spec_sha256": "68a07904e6ca6d059c396f72e5db67306e565c5f32ac6255542b0bb9d266211a",
  "constitution_path": "AGENTS.md",
  "constitution_sha256": "c53bd9f14bb368cdf4d2462e36397c33d17463c5a0253cc7209cbf359c5c044a",
  "review_path": "docs/features/t1075-knowledge-redesign.review.md",
  "review_mode": "independent",
  "model": "gpt-6.1-sol",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "c72fc3ca29d7f2cd141730f2b32b9b6a4464bd9f3fef1060d41f8394c9a52db4",
  "open_findings": [
    {
      "id": "REV-001",
      "status": "open",
      "severity": "minor",
      "category": "correctness",
      "requirement_anchor": {
        "id": "T-1075-USER",
        "quote": "核心要和数据读取写入衔接起来，否则是空壳"
      },
      "acceptance_anchor": {
        "id": "collection",
        "quote": "只展示匹配集合，可再选条目"
      },
      "where": "docs/features/t1075-knowledge-redesign.md:17；backend/src/modules/knowledge/knowledge.transport.ts:128-135；contract/src/primitives.ts:37-40；contract/src/client.ts:58-78；backend/src/application/transport.ts:67-76",
      "failure_mode": "既有knowledge.list transport目前把全部items作为data返回，仅在meta回显page/pageSize，没有切片；contract client与组合transport也不补分页。若新前端按每个请求一定只有100条循环，会重复请求并重复条目，或错误推断结束；如果照旧请求pageSize200则HTTP输入会违反max100。SPEC已有完整读取要求，实施时必须核对这一真实差异。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "只读源码：knowledge.transport.ts:131-134执行service.listKnowledge后直接items.map；paginationQuery.max(100)；createClient只解析envelope并返回data；createApplicationTransport直接分发。没有运行真实分页或数据库测试，不将推断标成runtime-observation。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "SPEC-LINE:17:a32f1b91a8a81f32",
      "suggestion": "在既有knowledge.list内落实合法页语义，或明确处理现有全量回包；不新增operation。以实际公开transport验证超过100/200条时完整、无重复、终止有据与必要页失败显示错误，并验证旧高级视图的完整读取兼容；不能把data.length误当库中total。",
      "resolution_evidence": "",
      "parent_id": ""
    },
    {
      "id": "REV-002",
      "status": "open",
      "severity": "minor",
      "category": "data-integrity",
      "requirement_anchor": {
        "id": "T-1075-SCOPE",
        "quote": "操作范围是当前用户/当前账号组；旧单账号兼容沿既有归属守卫"
      },
      "acceptance_anchor": {
        "id": "navigation",
        "quote": "保持本scope可见选择，拒绝跨scope请求"
      },
      "where": "docs/features/t1075-knowledge-redesign.md:18-19,41,47；backend/src/modules/knowledge/knowledge.service.ts:169-188；backend/src/modules/knowledge/knowledge.repository.ts:500-535；backend/src/modules/knowledge/knowledge.repository.ts:389-407；backend/src/schema/knowledge.ts:28-29",
      "failure_mode": "createKnowledge当前仅校验当前workspace可写并直接透传folderId/assetId；repository创建时直接保存两个软引用，schema也没有外键或scope校验。移动资料已校验目标文件夹，但创建时若收到别组或不存在的folderId/assetId，可能生成挂在不可见文件夹或错误来源上的当前scope知识。仅前端从下拉框挑真实ID不足以证明SPEC的后台范围约束。",
      "evidence_kind": "deterministic-check",
      "evidence_ref": "只读源码：knowledge.service.ts:188直接repo.create；knowledge.repository.ts:514-515直接赋folderId/assetId，创建块无目标资源验证；moveToFolder:393-407已有user/workspace/active文件夹验证；backend/src/schema/knowledge.ts的两列为soft reference。未向真实库提交越界请求，未声称已实跑越界复现。",
      "risk_class": "confirmed-requirement",
      "disposition": "mitigate",
      "remedy_type": "clarify",
      "scope_effect": "none",
      "origin": "baseline",
      "origin_ref": "SPEC-LINE:18:775489de05aaa594",
      "suggestion": "按SPEC已有范围要求，在后台现有knowledge模块及既有asset服务端口验证非空folderId/assetId，拒绝悬空或越界挂载；显式授权共享资源沿已有grant权限，不把可读grant扩大成写原资源。由service/repository完成校验，不跨模块直连repository，不新增owner、表或服务。聚焦公开create→读回与错误无落库测试覆盖真实当前组、另一组、另一用户、未知ID及原单账号兼容。",
      "resolution_evidence": "",
      "parent_id": ""
    }
  ],
  "resolved_findings": [],
  "receipt": "b0f59286f80b"
}
```
