# T-1429 审核链来源迁移与合并恢复

用户2026-10-28明确“按方案执行”：恢复38ba88d05重编号/合并损坏的审核链，保留两条原件、当前新任务编号与未解决问题，完成校验再接回T-1420。无推送/合main/发布授权。

## 确认需求

FR-142901：保留损坏链与两个父提交原链的字节、SHA256、来源commit。两条原链共同前缀384条；远端24d5f3232有385条，本地3a0d8ac63有446条。基础使用远端完整385条；另62条以历史导入追加。原封存事件不可改写，迁移事件使用新hash并绑定原事件和完整来源链，不把历史导入当作新评审。
FR-142902：任务映射只使用DEC-142801的明确映射；来源由commit+原任务ID+原事件hash识别，不能全局替换字符串。导入只更改事件外层task_id/spec_path/review_path/previous_event_hash，并添加来源元数据；模型、packet、findings、cycle/round、cycle_authorization（含nonce）逐字值保留。按显式文件映射调整落点，原spec/constitution哈希保持；文档内容变化不能自动继承PASS。
FR-142903：reviewctl增加显式迁移预演和apply入口。输入manifest冻结基础、来源、损坏链SHA、完整事件覆盖及任务/路径映射；先校验原链、共同前缀和覆盖，再生成确定性结果。audit必须验证所有导入的来源/目标允许变更，常规record仍先拒坏链。不能弱化现有审核、版本或三轮限制。
FR-142904：修改ledger、BACKLOG回执和current snapshots形成一个状态锁内事务。预演只读，apply比较所有输入的冻结字节；重复执行不得重复追加；写失败回滚，进程中断通过持久journal恢复；恢复时遇第三方新修改拒绝覆盖。历史原件/导入manifest长期保存且纳入audit。
FR-142905：只重建对应最新事件的审核快照与回执；文档哈希不一致仍报过期并由独立评审处理。保留失败、轮次及已消费授权；迁移不改变任务状态、验收和业务数据。T-1420当前规格已改变，单独真实复审，不把旧包重新贴为新PASS。
FR-142906：先在隔离worktree实现/预演/实测，再把已审修复带回原工作区并完成本地cherry-pick，保持T1420业务改动和用户测试数据。合并前链校验守卫防止重演。所有改动形成可回退的本地提交，不推送。

## 验收

AC-142901：完整原链各自校验通过，保留447条源事件的并集（公共前缀仅一次），其中62条可逐一追到原hash；损坏原件归档，原始字节无变化。
AC-142902：自动测试证明改坏来源、假映射、丢记录、重复记录、篡改导入packet/nonce/结论、越界路径会被拒；过期SPEC仍阻止PASS开工。
AC-142903：CLI dry-run不写，apply幂等；预演后状态变化被CAS拒绝；中途异常和进程中断可恢复，锁冲突不写，第三方更改不被回滚覆盖。
AC-142904：真实本地链迁移后reviewctl audit通过；若暴露独立旧规格过期，精确列出并经过真实复审再登记，不能降低校验。新评审独立记录，不伪造历史时间/模型。
AC-142905：原T1420所有源代码和业务验收证据保全，两个真实样本仍在，原Git index/cherry-pick状态有备份；只在迁移审查通过后结束本地cherry-pick。未推送/合main/更新安装包。

## 实现与验证范围

仅orchestrator/process/reviewctl.mjs、新增review-ledger-migration.mjs及对应测试、state-lock既有接口调用、BACKLOG/DECISION_LOG/context/modules/事件控制面、docs/features/t1429*、docs/verification/t1429/**及来源事件实际绑定的current review快照。若需规格复审，仅核对迁移或新版本实际影响的文档；不改产品实现/依赖/构建配置。测试node --test审核工具/迁移/状态锁/任务控制与回执相关用例；git diff --check、边界、timeout规范及read-only reconcile。恢复工具自举时现链无法登记review：先取得独立审核包，只在隔离树开发；有效链恢复后再用正式reviewctl登记该包与taskctl状态，不能写假回执或取消验证。
