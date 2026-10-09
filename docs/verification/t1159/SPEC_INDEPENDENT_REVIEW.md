# T1159 当前 main 微信原生报表闭包整合：独立 SPEC 初审

- 评审时间：2026-10-10T03:44:47+08:00
- 只读工作树：`/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator`
- 实读 HEAD：`aa7de1e91183ec0236a82cd954a4f4bf9bb1aeb1`
- SPEC SHA-256：`db8cf4823ddfc1789e277a8dec2a0aad8cd2787ec265173eab5af17ca1abd2f4`
- modules SHA-256：`bcebe6b9cbf792e0e5d85c9698d448af0d5700dd659454905aff7f6678777d01`
- PAGE_SPEC SHA-256：`4f003ececceea68aa7cb89ed5eac12e4e20acde2d01398edd407bdff900f0a37`
- SOURCE_MANIFEST SHA-256：`ce24cfa9ef39fa568a4d395638a572e319f49724aaa27675c89df95f7ac2f83a`
- 产品定位 SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- T1158 准入报告 SHA-256：`2670f38205a76d418fb6a63f31ec6404ce3b178ed0bb2b139d89c4e87721e09a`

## 结论

**PASS（仅准许进入实施与隔离验收）。** 未发现阻断实施的 SPEC 缺口。该结论不继承来源 PASS，不表示真人微信同步、安装真实 profile、AC-LIVE、T1148 最终旧收据、全局 Gate 或任务完成已经通过。

## 复核结果

1. **来源闭包可复核。** SOURCE_MANIFEST 恰有 56 条：33 产品、21 测试、2 包文件，其中 18 条当前 main 不存在；逐条从冻结来源 `293d4e98d2cedbd04eebce16a62f921711ee8079` 读取的字节 SHA 与 manifest 完全一致。SPEC 要求逐段合并 base/source/current，明确排除 6 条已被 main 替代的路径，也禁止复制来源控制面或直接 merge/cherry-pick，能保护当前 T1112、T1123、素材、图表、画幅与超时修复。
2. **契约与归属边界完整。** nativeReports 通过严格 contract、backend 0131/service/transport、worker service port 与正式 UI 串联；冻结 user/group/account/member version、lease、generation、跨组/转组拒绝、旧组历史、分页与字节/窗口幂等均有明确要求。纯组工作区仍可承载组内账号，实际报告读写继续绑定真实 account/member，不复制旧平台账号门到无关能力。
3. **旧数据和调度兼容没有被放松。** 0130 不动、0131 只追加；disabled/custom cron、原任务 ID、报告历史、旧绝对期限及单账号在途规则保留。恢复只延续未过期任务及剩余预算，禁止重发或续期。供应链固定 SheetJS tarball/integrity，bundle、类型及真实公共 scheduler/owner 组合都在验证命令内。
4. **隔离验收不会冒充真人成功。** 新 Chrome 合同用 fresh PGlite、无外网、scheduler 关闭、身份未验证的手工微信账号；只接受 reports.list=0，并要求同步以 SCOPE_MISSING 拒绝且零 run/浏览器/下载。三视口、刷新、重复与返回绑定真实公开调用。组件/隔离 service 的合成报告覆盖和真人采集被明确分开。
5. **研究 family 与暂停继承正确。** family 固定为 `wechat-statistics-visible-section`，两次实验已用尽、remaining=0、导航原因 UNKNOWN；不得换 ID、补第三实验、真人绑定/同步/调度/下载或安装真实 profile。来源浏览器交回后的原入口只读核对仍受用户控制及 resume criteria 约束，不是实施前置，也不能产生新任务或下载。
6. **验证闭包与 56 路径一致。** 21 个测试来源中，私有 smoke 辅助入口明确保留但不执行；其余 20 个原测试全部出现在 contract/backend/worker/frontend 命令。另有当前集成 contract、新 Chrome、四端 type、worker build、T1101/T1136/T1140 旧旅程、LED-047、timeout、三门卫、diff、pmem 与 reconcile。PAGE_SPEC 的 7 个 watched paths、三视口及 refresh/repeat/back 与 SPEC 对齐。
7. **最终旧收据不会提前签。** 共享源码最终冻结后才分别重做 T1148 相关旧任务的当前 HEAD 报告并正式 resume/complete。AC-LIVE 继续为未通过，因此即使隔离实现可以提交，也不能把 T1159 写成全绿或完成。

## 边界说明

- 本轮没有运行 Next、测试、构建、真人采集、数据库或模型，也未检查任何用户凭据。
- 本评审没有证明来源代码能无冲突落入当前 main；实施时仍须依 SOURCE_MANIFEST 做逐路径三方合并并执行完整命令。
- 真人公众号尚未绑定、视频号仍为 0 报告、导航机制 UNKNOWN；这些事实必须继续显示为暂停/待验，不能由 mock、合成表或隔离 Chrome 替代。
