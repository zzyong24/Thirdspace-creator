# SPEC Review — current

- Task: T-1022
- Verdict: PASS
- Round: 3/3 (recheck)
- Spec receipt: 6bd95c85af7c
- Review receipt: 2f179f8d9380

## 当前有效问题

当前无未销账问题。

已销账：REV-001 (docs/features/t1022-account-group-workspace.md:60,62,66,68,70,76,147；PAGE_SPEC.md:8,9,12；UI_RULES.md:22,23：当前成员用于新任务/登录/秘密授权，历史作品读取按冻结事实groupId，筛选来自历史事实与当前成员并集并标记已转出；平台事实保留真实accountId，快照继承父Publication，旧Publication新增指标仍归原组。此次页面增补只增加组总览与平台筛选，没有改动该范围；组页面API继续受3.2的按操作授权约束。既有历史消失/串组方案矛盾保持解决，实际A→B隔离与快照链路待实现验收。)；REV-002 (docs/features/t1022-account-group-workspace.md:123,125,127,129,151,166：项目及阶段、contentOutput、稿子、引用素材、关联Publication/全部快照与复盘来源构成资料归组闭包；显式迁入Publication随父项目归组，只转账号则留原组。共享资源保留实体与storageKey，目标组仅获同用户明确授予的resource access grant，读取/下载/导出经service/blob授权，编辑仍属原实体组；preview/apply/status绑定闭包、grant、digest、版本、同锁复核、全闭包原子事务及before-image。页面增补未变更该约束或声称已执行迁移，第10节仍将闭包及资源授权引用列为待用户确认。既有悬空依赖/扩大原组权限的方案缺口保持解决，真实blob/事务/撤销待实施验收。)；REV-003 (docs/features/t1022-account-group-workspace.md:63,78,80,94,161；PAGE_SPEC.md:7,14,30；UI_RULES.md:29,33：转组、关联账号任务创建、定时任务认领仍经同一platform-account service port，按稳定顺序事务锁platformAccount与有效membership；锁内重读成员并冻结groupId/version/accountId，worker副作用前校验版本，恢复沿用原冻结范围。创建先持锁阻止转组、转组先提交拒绝旧版本创建的双顺序验收保持不变；新页面约束保留后台任务和前台离开保护，scope/筛选变化拒绝旧响应。原并发窗口方案缺口保持解决，具体状态映射、并发及LED-047回归仍待合同/实现验证。)；REV-004 (docs/features/t1022-account-group-workspace.md:70,119,133,166,168；PAGE_SPEC.md:3,21,22,41：离线备份及暂停写入后校验，开放新写入前可完整恢复；开放后保留新schema/新增资料并提供只读/导出及向前修复，不承诺无损降回旧NOT NULL accountId schema。旧安装包恢复须明确选择迁移前备份且先导出新增资料；undo仅在版本未变且无后续任务/发布/grant消费时依before-image撤回，legacy入口不扩大权限或把空组对象塞进默认账号。空组仍能创作，该能力没有被页面增补或绑定门槛取消；第10节仍明列迁移及回退选择待确认，原型不执行真实库操作。原数据丢失式回退承诺缺口保持解决，真实迁移/恢复演练和用户授权待落实。)

```spec-review-state
{
  "schema": "spec-review-state/v2",
  "task_id": "T-1022",
  "cycle": 1,
  "round": 3,
  "max_rounds": 3,
  "review_kind": "recheck",
  "verdict": "PASS",
  "summary": "本轮依据 reviewctl context 的 round-2 packet、主SPEC新增/修改行3、9、94、96、166、168及作者提供的对应旧文，仅复核用户2026-10-04纠偏带来的原版增补页面约束。四项既有 REV-001～004 在方案层面继续 resolved，无新增确定性 finding。SPEC第5节、PAGE_SPEC第7～14及43～45行、UI_RULES第17～33行一致保留原问候、五指标卡、三列六区块、底部账号入口位置、个人身份、合法入口和任务提醒；平台筛选只更新指标/发布/趋势，组内创作卡片与在途任务不因筛选消失；创作者总览复用查询，不另存业务事实。第6节与PAGE_SPEC第24～30行保留未知/真实0、部分平台失败、晚到响应与归属错误的不同处理。第3节和7节的数据主体与已销账约束未变化。用户明确否定A/B并要求保留原版，故第10节将该视觉方向记为已选定有依据；这不等于授予旧资料迁移、定位选择、资源授权引用或回退选择，以上仍在第10节标为待确认。SPEC第3、137、168行与PAGE_SPEC第3、41、45行明确生产未接入、接口planned、截图数字限截图平台及时间且非实时，未冒称绑定/迁移/发布或真实实现已通过；与产品宪法第15～20、33～37、103～109行的事实及归属原则相容。本结论仅覆盖SPEC方案及文本约束，不提供UI、视觉评分、操作走查、真实迁移或真机PASS；正式review verdict及hash回执由reviewctl裁决。",
  "spec_path": "docs/features/t1022-account-group-workspace.md",
  "spec_sha256": "6bd95c85af7c09612acb36c3596cc43e5e48ed789b5284c7bc8f5d5c3e5ca29f",
  "constitution_path": "docs/产品定位.md",
  "constitution_sha256": "86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800",
  "review_path": "docs/features/t1022-account-group-workspace.review.md",
  "review_mode": "independent-context",
  "model": "GPT-6",
  "policy": "convergent-review/v2",
  "cycle_authorization": null,
  "latest_event_hash": "90d21d9fcbe5c1961ea8a53b4d856381fc8e5bf49089ff63d4c9f46b0ad2d6c8",
  "open_findings": [],
  "resolved_findings": [
    {
      "id": "REV-001",
      "resolution_evidence": "docs/features/t1022-account-group-workspace.md:60,62,66,68,70,76,147；PAGE_SPEC.md:8,9,12；UI_RULES.md:22,23：当前成员用于新任务/登录/秘密授权，历史作品读取按冻结事实groupId，筛选来自历史事实与当前成员并集并标记已转出；平台事实保留真实accountId，快照继承父Publication，旧Publication新增指标仍归原组。此次页面增补只增加组总览与平台筛选，没有改动该范围；组页面API继续受3.2的按操作授权约束。既有历史消失/串组方案矛盾保持解决，实际A→B隔离与快照链路待实现验收。"
    },
    {
      "id": "REV-002",
      "resolution_evidence": "docs/features/t1022-account-group-workspace.md:123,125,127,129,151,166：项目及阶段、contentOutput、稿子、引用素材、关联Publication/全部快照与复盘来源构成资料归组闭包；显式迁入Publication随父项目归组，只转账号则留原组。共享资源保留实体与storageKey，目标组仅获同用户明确授予的resource access grant，读取/下载/导出经service/blob授权，编辑仍属原实体组；preview/apply/status绑定闭包、grant、digest、版本、同锁复核、全闭包原子事务及before-image。页面增补未变更该约束或声称已执行迁移，第10节仍将闭包及资源授权引用列为待用户确认。既有悬空依赖/扩大原组权限的方案缺口保持解决，真实blob/事务/撤销待实施验收。"
    },
    {
      "id": "REV-003",
      "resolution_evidence": "docs/features/t1022-account-group-workspace.md:63,78,80,94,161；PAGE_SPEC.md:7,14,30；UI_RULES.md:29,33：转组、关联账号任务创建、定时任务认领仍经同一platform-account service port，按稳定顺序事务锁platformAccount与有效membership；锁内重读成员并冻结groupId/version/accountId，worker副作用前校验版本，恢复沿用原冻结范围。创建先持锁阻止转组、转组先提交拒绝旧版本创建的双顺序验收保持不变；新页面约束保留后台任务和前台离开保护，scope/筛选变化拒绝旧响应。原并发窗口方案缺口保持解决，具体状态映射、并发及LED-047回归仍待合同/实现验证。"
    },
    {
      "id": "REV-004",
      "resolution_evidence": "docs/features/t1022-account-group-workspace.md:70,119,133,166,168；PAGE_SPEC.md:3,21,22,41：离线备份及暂停写入后校验，开放新写入前可完整恢复；开放后保留新schema/新增资料并提供只读/导出及向前修复，不承诺无损降回旧NOT NULL accountId schema。旧安装包恢复须明确选择迁移前备份且先导出新增资料；undo仅在版本未变且无后续任务/发布/grant消费时依before-image撤回，legacy入口不扩大权限或把空组对象塞进默认账号。空组仍能创作，该能力没有被页面增补或绑定门槛取消；第10节仍明列迁移及回退选择待确认，原型不执行真实库操作。原数据丢失式回退承诺缺口保持解决，真实迁移/恢复演练和用户授权待落实。"
    }
  ],
  "receipt": "2f179f8d9380"
}
```
