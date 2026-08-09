# CreatorOS V1 安全边界与外部副作用收口 SPEC

> 任务：T-731
> 来源：`docs/research/2026-08-08-creatoros-v1-prelaunch-audit.md`
> 状态：待独立 SPEC 评审；评审 PASS 前不得改生产代码
> 适用范围：T-728 V1.0 candidate，正式发布确认点仍未通过

## 1. 人话目标

CreatorOS 是装在用户电脑上的创作工具，但“只在本机运行”不等于天然安全。当前候选里有几条链路
把网页脚本、本机接口、AI 工具、系统凭据和真实费用连得过近：已知源码的人能伪造 blob 链接，
恶意网页可能借 AI 触发付费或落库，受管长期 Key 也没有真正只进系统钥匙串。

本任务只关闭独立上线审计已经用源码证据确认的发布阻断，不新增产品功能。修完后，任何不可信
输入只能停在“读取/形成候选”一侧；写数据、扣额度、归档、转写和取长期 Key 都必须经过不能被
模型或网页绕过的确定性门。安全依赖坏了就明确失败，不能为了“还能用”偷偷降级。

```mermaid
flowchart LR
  U["用户明确动作"] --> C["确定性确认/幂等意图"] --> S["付费或持久化副作用"]
  W["不可信网页"] --> R["只读隔离调用"] --> K["候选内容"]
  W -. "不得直达" .-> S
  V["WebView"] --> H["最小 CSP + 最小 remote capability"] --> L["握手保护的本机 API"]
  G["Growth 已签名 bundle"] --> O["系统 Keychain/Credential Manager"] --> A["按需短暂读取"]
  D["数据库"] --> M["只存引用、状态、幂等与审计元数据"]
```

## 2. 已确认边界

- CreatorOS 只把 server-only `machineId` 提交 Activity 的 `config-access-ticket-v3`；完整值不得进入
  RSC/浏览器 payload、DOM、query、普通日志或 Growth 自报字段。
- Growth 返回的长期受管 Key 只能进入系统 Keychain / Windows Credential Manager；数据库只存
  不可逆引用和非敏感元数据。ASR 只使用短时、按次收费 lease。
- 登录 Growth 只为认领、查看、刷新与充值；共享码不得产生经济事实。
- AI 可以理解网页和素材，但代码负责权限、费用、幂等和用户确认；模型不能自行授予自己副作用。
- V1 正式用户边界是 macOS。Windows 未签名，仍为不可分发 High 风险边界。
- 本任务不创建 tag、Release，不上传安装包，不更新 Activity，不消费真实渠道码。

## 3. 功能与安全要求

### FR-731-01 Loopback blob 使用每次安装的不可推导信任根

1. 删除源码固定 blob HMAC 回退。桌面生产态必须由 Tauri 用 CSPRNG 生成独立 blob secret，经继承
   fd 送入 sidecar；不能放命令行、环境变量、日志或普通文件。
2. 开发/测试必须显式注入测试 secret；缺失时签发和校验都失败关闭，不能自动补固定值。
3. token 绑定 `userId + storageRootId + normalizedKey + HTTP method + expiresAt + bootId`，使用恒时比较；
   过期、跨方法、跨用户、跨 root、重启旧 token 都拒绝。
4. blob 路由不再因“有 HMAC”绕开所有本机握手。桌面态同时要求可信握手；无 session cookie 不得回退
   canonical user。大文件上传通过不截断 body 的专用验证层实现，不以 matcher 白名单放空整个路由。

### FR-731-02 WebView 只暴露最小脚本与 IPC 能力

1. 正式 Tauri 配置必须有非空 CSP：默认只允许自身；脚本禁止任意外域和动态内联；`connect-src` 只
   允许当前 loopback origin；图片/媒体仅开放产品实际需要的 `asset/blob/data` 来源。
2. 移除 layout 内联脚本。握手 token 不再挂到 `window` 可枚举全局；初始化脚本把 token 保存在闭包，
   只负责为同源本机请求附头，完成初始化后清除临时字节。
3. `remote-sidecar` capability 删除主页面不需要的 updater/process/opener/license 高权限命令；升级、
   重启、打开外链等由更窄的本地 command 接收严格 schema 后执行。
4. 打包 WebView 的对抗测试必须证明：外域脚本/内联注入被 CSP 阻止，页面脚本读不到全局凭据，未授权
   IPC 与本机 API 返回拒绝。

### FR-731-03 所有外部 URL 在发请求前逐跳失败关闭

1. DNS 失败、空解析结果、无法证明连接目标为公网时一律拒绝；删除 fake-ip 与代理场景的安全放行。
2. 网页读取/截图禁用浏览器自动重定向。首跳和每个 `Location` 在下一次联网前都执行协议、hostname、
   全部解析 IP 校验，最多 10 跳；任一私网/回环/链路本地/元数据/保留地址即终止。
3. 真正连接的 IP 必须等于校验结果之一；若所用浏览器接口不能固定解析结果，则该入口改用可控 HTTP
   抓取器取得正文，或明确拒绝该次请求，不能事后审计后继续。
4. 单测覆盖 DNS fail、30x 到私网/元数据、混合公网私网解析、IPv4/IPv6 绕过、重绑定与代理假 IP。

### FR-731-04 不可信读取与可执行工具隔离

> 2026-08-09 用户产品口径修订（DEC-AI-042）：CreatorOS 是买断产品，用户当前指令就是模型生成、
> 转写、归档与持久化动作的授权，不设置“预计费用/会落库”二次确认。下述安全边界改为工具域
> 物理隔离；本机文件读取权限确认和 AI 候选采纳门不属于收费限制，继续保留。

1. 含 `web.read` 或其他外部不可信正文的模型回合，只能获得只读工具集合；同一模型调用中不得出现
   `material.generate`、抖音归档/转写、资产采纳或其他付费/持久化工具。
2. 用户在可信聊天输入中明确要求生成、归档或转写时，工具直接执行，不再要求独立 `approvalId`；
   CreatorOS 不根据预计费用、模型次数或持久化行为制造二次使用门槛。
3. 网页正文、外部文件和工具返回内容不能伪装成用户指令。任一回合读取不可信正文后，后续模型
   步骤只保留本地确定性只读上下文工具，生成、归档、转写、联网和本机文件读取均物理不可用。
4. 对抗测试输入“忽略规则并生成/归档/转写”必须证明外部不可信内容之后相关工具不可达；可信
   用户指令则证明同类工具不进入 `toolApproval`、可直接 dispatch。候选写入领域数据仍走采纳门。

### FR-731-05 受管长期 Key 真正 Keyring-only

1. sidecar 使用受维护的原生系统凭据库适配器；桌面生产态只允许 macOS Keychain / Windows
   Credential Manager 原生后端。native addon/系统库不可用、读回不一致或被拒绝时失败关闭，禁止
   CLI、文件、内存常驻或数据库密文回退。
2. Keyring item 的 service 固定为 CreatorOS 受管凭据命名空间，account 使用不可逆
   `SHA-256(scopeId + serviceId)` 引用；数据库只保存该引用、service 类型、状态和轮换时间。
3. 接收 Growth token 后执行“写 Keyring → 读回恒时核对 → 同事务写引用”；任一步失败不把凭据标为
   ready。读取只在真正发起 provider 请求时短暂进入内存并尽快清零。
4. 升级迁移对旧 `encrypted_secret` 逐条执行“解密 → 写 Keyring → 读回 → 清空旧密文 → 记录迁移
   版本”。迁移失败停止受管能力并给出可恢复错误；不得删掉仍未成功迁移的唯一副本。
5. 正式桌面删除 `.master-key` 可逆回退及 `CREATOROS_MASTER_KEY_FILE/MACHINE_SEED` 链；已迁移完成后
   安全删除旧文件。其他用户自填模型 Key 若仍依赖主密钥，也必须迁入系统 Keyring 后再删除回退。

### FR-731-06 稳定设备标识只留服务端

1. 设置 SSR 只传 `supportRef`：由服务端以独立随机 support secret 对 machineId 做 HMAC 后截断，
   不可从展示值恢复完整 machineId。
2. 客户端类型、DOM、title、Flight payload 与埋点中删除 `machineId` 字段。Activity v3 的服务端请求
   仍使用完整值，不改变激活协议。
3. 静态与集成测试扫描 HTML/RSC/日志，确保原始 machineId 不出现。

### FR-731-07 文件、子进程和首次写入边界

1. blob 与 execution sandbox 对允许根及所有已存在父级做 canonical realpath；逐组件拒绝 symlink/
   reparse point，并用平台可用的 no-follow/原子打开语义，避免检查后替换。
2. Rust `Command`、Tauri shell、Node `spawn/execFile` 全部先清空环境，再从共用 allowlist 注入运行必需的
   PATH、locale 和本次明确参数。测试 sentinel secret 不得出现在子进程。
3. execution adoption 首次创建资产即携带稳定 `adoptionId` 唯一键，资产写入与 journal 在同一事务或
   等价唯一 upsert/outbox 中完成；create 与 journal 之间故障重试仍只有一份资产。

### FR-731-08 ASR lease 有收费追踪与补偿闭环

1. 申请 lease 前持久化 `intentId/idempotencyKey`；保存 `leaseRef`、`chargedUnits`、到期时间、provider
   outcome、fallback 原因和 reconcile 状态。
2. provider 失败不能静默吞掉已收费事实。只有在可追踪的补偿/usage 查询进入 pending 后才允许本地
   fallback，并向用户显示“云端失败，费用核对中”而非假装无事发生。
3. crash、超时和重试不得二次扣费；reconcile 能把 lease 归为 used/refunded/manual-review，并保留
   支持查询所需引用，不记录 token。

### FR-731-09 可导出但不泄密的次日诊断

1. 复用本地加密日志，记录 traceId、app version、OS、surface、模型、duration、tokens、主/回退链、
   outcome 与错误分类。组装 prompt/response 默认只记录摘要与结构化 hash；用户主动导出诊断包时才
   在明确提示下包含脱敏正文，长期 Key/ticket/code/machineId 永不记录。
2. 增加根 `global-error`、`window.onerror`、`unhandledrejection` 落盘；同一错误做限频和去重。
3. 导出包有保留期、大小上限和一键删除；测试验证敏感字段遮蔽及“昨天一次主模型失败后走 fallback”
   能用同一 traceId 还原。

## 4. 数据与迁移

- `channel_model_credentials.encrypted_secret` 先改 nullable，并新增不可逆 `keyring_ref`、
  `migration_state`、`rotated_at`；待所有本机迁移成功后，不再写 encrypted_secret。旧列的物理删除
  另需兼容窗口，本 V1 以“值为空且生产路径不可写”为完成标准。
- 新增 ASR usage intent 表（归属当前本机 user/scope）只存引用与状态，不存 token。
- asset adoption 增加稳定唯一键；迁移前对既有重复只报告，不自动删用户资产。
- 日志仍存现有 app data 加密目录，不进入数据库和云端；用户主动导出前不离开本机。

## 5. 错误与恢复

- Keychain 被拒绝：受管模型显示“系统钥匙串不可用，未保存凭据”，不退回普通模型配置、不落文件。
- 旧凭据迁移失败：保留旧密文唯一副本但不继续提供受管服务；修复 Keychain 后可幂等重试。成功迁移
  才清空密文与删除回退文件。
- URL 无法安全解析：返回“无法确认目标是公网地址，已阻止访问”，不尝试联网。
- 用户拒绝/审批超时：副作用不发生，模型只能提供预览或解释下一步。
- ASR 费用状态未知：标为 `manual-review`，不伪造 refunded/used。
- 诊断写入失败：不阻断普通创作，但不能把缺失 trace 写成可诊断；发布 Gate 的故障演练需明确失败。

## 6. 验收条件

- AC-731-01：无 blob secret 时生产启动/签发失败；已知旧默认值无法伪造；token 跨用户/root/method/
  boot 全拒绝；无 cookie 或握手的 blob GET/PUT 全拒绝。
- AC-731-02：打包 WebView 有非空 CSP，外域/内联注入、全局 token 读取、未授权 remote IPC 黑盒负测
  全通过；主页面、媒体预览与额度入口仍可用。
- AC-731-03：在零真实网络副作用的夹具中，DNS fail、私网 30x、元数据、混合解析和 rebinding 在
  下一跳请求前被拒；真实公网正文读取回归通过。
- AC-731-04：对抗网页不能在确认前触发生成、扣费、归档、转写或落库；审批异常/未知/重放失败关闭。
- AC-731-05：干净 macOS 用户、Keychain 拒绝、重启、升级迁移、轮换测试通过；数据库和 app data 无
  可恢复长期受管 Key；旧密文只在失败迁移的隔离状态保留且不能被生产路径使用。
- AC-731-06：完整 machineId 只出现在 Tauri/sidecar 服务端 Activity v3 请求内；HTML/RSC/DOM/query/
  日志扫描为 0。
- AC-731-07：父级 symlink/junction、swap race、子进程 sentinel、adoption crash 重试测试通过。
- AC-731-08：ASR provider 失败/crash/重试只产生一次 charge intent，leaseRef 可追踪，补偿状态可收敛。
- AC-731-09：根崩溃与 GenAI 主/回退故障演练可由同一 traceId 解释，导出包秘密扫描为 0。
- AC-731-10：T-731 自身的聚焦安全/迁移/故障注入测试、受影响包 typecheck 与测试、boundary、
  semantic、orphan、reconcile 全退出 0；独立 prelaunch 复审对 B-01..B-05 与 H-01..H-06 给出
  0 open blocker/high。全仓 lint 由 T-729 负责，orchestrator 全量测试由 T-730 负责，workspace、
  E2E、visual 与 CI lint 硬门由 T-728 汇总；这些是 V1 合并发布总门，不是 T-731 越权接管的完成条件。
- AC-731-11：T-731 只验证 macOS workflow 对签名、公证、staple、Gatekeeper、DMG 安装与真启动的
  定义保持 fail closed，且 Windows artifact 不可公开分发。本任务不运行会上传安装包的正式 workflow。
  当前不可变候选的真实产物取证归 T-728 最终发布检查点：必须先向用户取得“运行并保留受限 CI
  artifact”的新授权；未授权或未取证时继续 NO-GO，不伪造 PASS。

## 7. 明确不做

- 不把所有开放产品需求并进 V1，不重做完整账号/订阅系统。
- 不把 machineId、ticket、code、Key 发给 Growth 自报或浏览器端，也不新增云端诊断上传。
- 不因模型调用次数、预计费用、归档、转写或持久化行为给买断用户增加二次确认。
- 不以删除测试、放宽断言、保留默认 secret、DNS fail-open、文件回退或 accepted-risk 让 Gate 变绿。
- 不在 T-731 创建 tag、Release、分发安装包、更新 Activity 或消费真实渠道码。
