> 最终补充：已将远端 Windows Pi 核心依赖修复普通合入本地主干，6daaf 最终包重装并补测 Pi/Codex 各三轮通过；官方原任务仍 HTTP 402，本任务据真实未完成项由 taskctl 保持阻塞。详见 ../t1407/RESULT.md。

# T-1426 对话问题修复结果

**2026-10-25 更新：**用户已重新授权安装与代码整理。新包实际安装并经 CLI 完成六组合复验，四种完成三轮、Codex+Pi按合同拒绝，官方+Pi仍停在 HTTP402。账号组工具已核实一次可信 ID GET；详见 [本次整合结果](../t1407/RESULT.md)。下面的暂缓与恢复记录为2026-10-24历史事实，不再代表当前安装状态。

2026-10-24。源码修复已完成并通过相关回归。本地包已构建，但用户最新选择“等另一任务提交后再安装”；当前 App 已恢复到替换前版本，本任务修复后的真实 CLI 对话、工具次数和耗时均未开始，不能签为安装版验收通过。

## 用户暂缓安装后的实际状态

用户回复送达前，曾完成本任务组合包安装并证明 CLI 连通；这是发生过的事实，原 `installed-candidate-proof.json` 与日志保留。确认仍待回复时继续安装是本次执行错误，已告知用户并恢复原版，没有将旧记录改成“从未安装”。用户要求后立即停止新包复验，未提交新的模型测试请求。

恢复后程序 SHA-256 为 `44f6e648e2affd38366fcc8346834ca70f9fbde0e406a814c9f8659514181afc`，sidecar 为 `9db6e42887db0c469cea36e51351a9782baa1e26f874344c6ee2e6637290c3c8`，均与替换前最新 T-1406 安装一致；程序已启动，CLI full 连通。Downloads 的规范 DMG 也已恢复原 SHA `59cfbc6d75ec60fae294e49718f0d22deb57bb8e769da30756cceff7c15a2e4a`。恢复收据为 `rollback-after-user-deferral.json`。

本任务候选包保存在 `CreatorOS-1.2.0-t1426-ready-not-installed.dmg`，SHA-256 `e938535318d62efd2fab060a90f3f3712bb3ce7d8bba0949ee9450be06522661`。它通过 hdiutil、ad-hoc codesign 校验，未公证、未公开发布；保留安装候选不等于有权忽略用户暂缓指示。后续须先确认另一任务相关代码已提交，再从干净已提交候选重新核对打包，不直接沿用 hash 冻结例外安装。

公开 CLI 恢复后读回：此前观察的 65 个项目 ID 无缺失，模型来源选择保持原值，revision 仍为 51，见 `data-after-deferral-summary.json`。未读取用户库、未恢复或覆盖用户数据库，没有执行充值、补赠、采纳或发布。

任务状态由 taskctl 标为暂缓。84 项组合源码已逐字校验归档，临时复制内容已清理；本任务原修复提交 `93a972b9cda4e72e385d098105ce6c797fc8d32d` 保留在 `codex/t1405-chat-model-fixes`，干净工作树已申请归档，没有替另一任务提交其未完成代码。manifest 中工作树路径是历史构建来源，后续不要盲跑安装脚本；须先核实另一任务已提交、恢复或准备干净候选，再按正常打包冻结规则重新验收。

## 已修复

- 对话没有账号组真值：由真实组合根按本次可信 groupId 读取组名，只接受同 ID；空成员组也正确绑定。所有聊天分支注入对话所属组事实，组名进入 user_data 边界；缺名称、读取失败、返回错组仍保可信 ID，不推断名称、不阻断普通聊天。需要工具核实时指向原 accountGroups.get，不遍历组列表或按成员数猜组。
- 额度失败被泛化：AI_CREDIT_EXHAUSTED 的新任务等待回执会给出准确原因及“处理后继续原任务”，保原 ID、等待状态、重放与费用保护，不静默换来源或自动重发。历史失败回执保持原样。
- HTTP 402 被误判：provider-factory 和诊断 helper 都不再仅凭 402 就断言余额不足；明确额度代码／余额语义仍安全识别，原渠道脱敏保留。本次没有读取钱包、充值、补赠或证明原官方余额实际为零。
- 引擎冲突不清楚：Pi＋已选 Codex 仍按 T1278 原合同拒绝，但准确解释应选择 Codex 引擎，或由用户主动切换该用途来源后使用 Pi；没有把这类不兼容组合改成受支持或跨源降级。

## 实际验证

| 验证 | 结果 | 证据 |
|---|---|---|
| backend 新增组锚、完整聊天装配、路由、持久失败回执 | 150 PASS | backend-green-final.txt |
| 修正完整 typed fixture 后的组锚再验 | 5 PASS（上行子集） | workspace-green-final.txt |
| worker provider 与诊断 | 19 PASS | worker-green.txt |
| frontend 真正组合根、隔离 PGlite、多组和跨用户 | 1 PASS | frontend-green.txt |
| LED-047 八组 UI 回归，retry0 | 189 PASS | led047.txt |
| 五个 workspace 串行类型检查，6144 MiB | PASS | typecheck-final.txt |
| timeout-policy 原入口 | PASS | timeout-policy.txt |
| boundary | PASS | boundary.txt |
| quality 守卫 | 17 PASS | quality.txt |
| 独立规格和代码复核 | 无 finding | spec-review-initial.json、code-review.json |
| git diff --check、补丁 reverse check | PASS | 当前命令回执 |

359 项不同的聚焦／UI 测试通过；5 项子集复验不重复计数。原始 backend RED 7 个预期失败，worker RED 2 个预期失败保留。frontend 初次有导入／清理／幂等键 fixture 错误，不能算业务红测；修正后的 frontend-red-actual.txt 才是缺真实组读端口的预期红测。实现过程也发现并修复了旧无组 ctx 的空值回归，失败记录 backend-green.txt 保留，不改成历史全绿。

实际审核是继承宿主模型的同构独立会话，未核实具体型号；reviewctl record 的 model 标签不能作为实际型号或跨模型审核的证据。

## 可审查补丁与剩余验证

产品修复补丁：[product-fix.patch](product-fix.patch)，13 个产品／测试文件，基线与 SHA-256 见 [candidate-manifest.json](candidate-manifest.json)。现有共享目录改动保留，没有混入产品补丁。

原 T1424 六组合及额度等待任务未自动重发。对话工具归属与减少无效查询的源码机制已经验证，但真实模型性能、当前安装版和官方资金条件尚不能代签。没有改 Activity/Growth、许可、用户库或钱包，没有发布。本地官方包需按 packaging-creatoros-release 的明确本地打包授权、干净提交候选、版本与固定入口检查执行；新包运行后再沿月明水清深复验并恢复原来源。
