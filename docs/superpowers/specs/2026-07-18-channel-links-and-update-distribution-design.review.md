# T-396 SPEC 评审记录

- **verdict**: CONCERNS(已处理)
- **review_mode**: cross-family
- **模型**: MiniMax(mmx text chat,2026-07-18)
- **材料**: 宪法(docs/产品定位.md)+ 被审 SPEC 全文;未传作者自评(防锚定)

## Findings 与裁决

| # | 严重度 | 内容 | 裁决 |
|---|---|---|---|
| 1 | blocker | G3「零发版」在重装系统/换机(缓存全丢)场景未覆盖,channelConfig 恢复路径未明确 | **接受**:激活码→渠道归属持久在服务端,重装后重新激活即恢复;SPEC §7 降级表补两行(应用内重置走 PRESERVE / 重装 = ≤1 次联网激活恢复),G3 语义显式化 |
| 2 | major | T-372 L1s 私钥未部署,安全模型依赖未就绪基础设施,验收 #5 无法端到端验 | **接受**:§9 补部署状态如实记(代码已上线/密钥已生成冷备/私钥配入服务器待用户);开发单测走 fake keypair 注入(license.rs 既有模式)不阻塞;E2E 验收以部署完成为前置 |
| 3 | major | 「中性降级」出现 4 次无操作定义,验收 #3 不可判 | **接受**:§7 补三条 UI 级定义(activate 纯文案无链接 / settings 购买入口整个隐藏 / 检查更新无下载按钮改联系文案) |
| 4 | major | updater endpoint 移除未声明平台范围,或影响 Windows | **部分驳回+澄清**:tauri.conf.json 为共享配置,移除即双端一致——这是有意设计(更新检查走渠道体系是双端同语义,win 用户同样跳渠道链接),与 DEC-W 不冲突;§6 补 scope 声明 |
| 5 | minor | 缓存文件无 schema 版本/迁移策略 | **接受**:§4 补 version 字段+不匹配丢弃重取 |
| 6 | minor | 「≤61min」无来源 | **接受**:§4 补引 T-372 L3 内测心跳 60min 拍板值+边际 |

## 人的裁决

方案本体(渠道配置随签名链下发+检查跳链接)评审无异议;全部 findings 为完整性/依赖显式化类,已逐条修订进 SPEC 正文。verdict ≠ FAIL,处理完毕后 T-396a/b/c 可开工(E2E 验收受 L1s 私钥部署前置约束,如实标注)。

---

# §3 数据模型修订评审（第 2 轮，2026-07-19）

- **修订内容**：渠道维度与 project 解耦——原「项目(=代理/渠道)维度加列」与发码方 agent-hub 已过审契约冲突(其 projectKey=产品维度,FR-008;码→代理归属在其台账 IssuedCode.agent_id)。改为 `Channel` 实体 + `ActivationCode.channelRef`,发码时打戳。客户端契约(§4~§8)零变化。
- **verdict**: CONCERNS(已处理) · review_mode: cross-family(MiniMax,`mmx text chat`,2026-07-19) · 裁决人：agent
- **材料**: 修订后 SPEC 全文；未传作者自评(防锚定)

| # | 严重度 | 内容 | 裁决 |
|---|---|---|---|
| 1 | blocker | `official` Channel 若靠人工创建,未建时官方码激活即中性降级,与 §8-2「官方码=官方链接」矛盾 | **接受**：§3 补「official 渠道随 T-396a 部署 seed 自动创建(初始=现官方链接)」,不依赖人工前提 |
| 2 | major | latest-version 只回 downloadUrl,downloadUrl=null 时「联系授权方」文案无链接,与 activate 页体验断裂 | **接受(客户端侧解)**：§6 补——本地缓存 channelConfig 有 supportUrl 则文案可点(用缓存渲染);端点不加字段,「无码不泄默认渠道」红线不变 |
| 3 | major | agent-hub 传 `agent-<id>` 但渠道未建 → 代理码静默中性降级,无强顺序约束 | **接受(提示不阻塞)**：§3 补「允许先发码后配链接」显式语义(配置后 ≤心跳周期追上)+ 可见性由 agent-hub 批准/发码响应 warning 兜(其契约 API-007/008 增量,TC-CH-6) |
| 4 | minor | Channel 存在但 downloadUrl=null 时 supportUrl 被无视 | **接受**：并入 #2 缓存渲染方案 |
| 5 | minor | 「省略=不戳」措辞歧义 | **接受**：改为「省略该字段 → 码的 channelRef=null,激活走中性降级」 |

5 条全部同轮修订进 SPEC 正文。**verdict ≠ FAIL，修订生效，T-396a 按 §3 修订版开工**（agent-hub 侧配套契约=其仓 SERVICE_CONTRACT 增量 v3 / T-020，2026-07-19 同日过审）。
