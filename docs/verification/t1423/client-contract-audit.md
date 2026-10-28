# T-1423 客户端一键升级契约审计

2026-10-23。只读源码审计及候选设计，**尚未实施或通过跨端验收**。

本轮只创建本文档。已读 T-1423 Packet §1–5、7–9，写前核对 §6，SPEC、项目物理架构及 CONTRACT 规则；产品到代码技能按契约阶段应用。未读真实许可、密钥或钱包数据，未调用生产接口、激活、发款或打包，未改 T-1422 隔离树。

## 1. 结论与适用范围

用户要求所有其他用户也能在自己的设备上“一键升级”历史永久激活码，不能靠维护者远程进电脑。入口应使用 Rust 已保存的原码，不把原码返回 JavaScript，不 reset、不换码、不重买，保原许可和钱包。已有钱包/Key/首赠复用；未领且符合原政策者由 Growth 完成唯一首次履约。这次点击是明确的升级行为，不增加每次启动或定时同步赠额。

**客户端可复用原生可信存储、签名/nonce 决策链、正常模型 proof/目录/既有凭据读取、原履约端口。不能直接给“普通 activate”套一个无参按钮就向所有用户开放。**当前 Activity 普通 activate 明确允许切换其他同机授权；必须先冻结并独审服务端原子保护合同。客户端预查和二次提示不能替代事务内保护。

本机单独授权允许恢复当前原授权及释放已经查明的一份失效旧绑定，不等于其他用户可以批量释放绑定，也不等于本机条件仍未变化。Root/Growth 应在真正提交前复核本机限定条件。本文不执行该操作，也不把本机 TIME 自动判为永久。

## 2. 审计基线及代码事实

Creator 主仓 HEAD：`9c585dd4db5f263d228bb71bb832700dfd81f64e`。Activity 参考源：`/Volumes/T7-MacData/CodexBuilds/Activity-T243-T244-20261017/source`，仅作当前旧契约证据；未来 T-1423 服务端实现不在本审计中假定存在。Root 转达 Growth 本轮确认：历史永久 TIME 的经济 v1 已覆盖，不需要改码或批量发款；通用恢复必须使用新的专用 fail-closed path，不能给旧 activate 加可能被忽略的字段。

以下路径除特别标注外相对 Creator 根目录；行号为本轮读取基线。

| 事实 | 源码位置 | 对方案的约束 |
| --- | --- | --- |
| 原码存在 `LicenseSnapshot.code`；整个快照可由主密钥派生 AES-GCM 密钥加密；文件为固定 appData `.license` | `frontend/src-tauri/src/license.rs:151–185, 787–868` | 由 Rust 读取，不能从 Node 展示副本或 JS 回传码。旧明文兼容并不等于新入口可以弱验签授权。 |
| `ShellLicenseCtx.machine_id` 来自当前启动 `resolve_machine_id`，不是盲用旧快照机器码 | `frontend/src-tauri/src/lib.rs:609–653, 2698–2706` | 比较快照项目/当前宿主身份；不同机器不能以“升级”静默搬迁。平台 ID 优先，拿不到时回退持久 UUID。 |
| 启动、心跳、IPC 共用 `chain_lock`；生产持久化函数内部已经取得该锁 | `frontend/src-tauri/src/license.rs:2466, 2504–2539` | 不能外层先持同一非重入锁再调用 `run_chain_and_persist`。取保存码与本次许可调用需要在一个受控临界区内完成，不能锁外读旧码后等待别的激活换码。 |
| Activate 使用传入码，Status 使用快照码；请求使用当前宿主 machineId/projectKey，并为每次尝试产生新 nonce | `frontend/src-tauri/src/license.rs:1755–1793, 1826–1835` | 复用真实请求构造与验签，不创建 Node status 替代。网络重试不是新的业务操作。 |
| 强验签覆盖 response digest、request target/host、签名/date；时差上限 300 秒、nonce 回显；最多 3 次瞬态尝试 | `frontend/src-tauri/src/license.rs:39–44, 364–410, 1857–1929` | 新合同若新增请求意图或端点，必须纳入真实签名 target 和响应 body，保持原防重放/回拨/运行期门。不能运行时关闭 strict。 |
| 当前持久化只调用 void `write_snapshot_file`；写盘失败只记日志，仍可返回 licensed | `frontend/src-tauri/src/license.rs:995–999, 2525–2528` | 新升级链不能把这个返回值当“原授权已保存”。使用 checked 写入并回读；不要借本任务悄悄重写全部旧调用语义。 |
| 已有 checked 原子替换；owned-device 保存器已处理“replace 已发生但 fsync 返回错误”的回读收敛 | `frontend/src-tauri/src/license.rs:886–993`；`frontend/src-tauri/src/owned_devices.rs:774–811` | 可复用写入原语/可注入存储测试方式。回读为新候选才确认保存；仍为旧值报告未保存；不一致报告 unknown，不能伪报成功或盲覆盖。 |
| 普通原生 `license_activate` 许可成功后另起线程触发 `Activation` 配置同步，返回值不包含同步/履约结果 | `frontend/src-tauri/src/license.rs:3008–3026, 2737–2742` | 新一键流程不能先调用旧命令，再由 UI 独立 POST 履约造成两个并发观察/履约入口。应抽取许可内部能力，新恢复 IPC 不触发这条异步经济同步，由用户点击的升级协调链随后串行调用一次原履约。旧 activate 行为保持。 |
| 普通 Activate 会把本地 `activated_at` 改为本次服务端时间 | `frontend/src-tauri/src/license.rs:2013–2017` | 新恢复操作不能照搬这个副作用；保存原许可的原始激活时间，不能把恢复展示成新购/重新开始有效期。服务端仍是实际期限权威。 |
| Rust 向 sidecar 同步授权展示副本是 best effort；请求含码，但不返回 WebView | `frontend/src-tauri/src/license.rs:2568–2609` | 展示副本失败与权威快照保存失败分开。不要由旧 `activation_state` 选恢复码。 |
| 模型 proof 在 Growth 请求之前获取；目录/credentials 与 fulfill 是不同操作 | `frontend/src/server/activation/model-benefit.server.ts:122–143, 203–210, 265–278` | 升级前可读证明/原凭据；恢复绑定前不得把 proof 拒绝误当成缺钱包。目录/credentials 保持零经济写；必须沿服务端已有 existing-only 合同。 |
| local client-config 仅 `activation` trigger 调履约，再读配置；后者失败会丢前者结果 | `frontend/src/app/api/v1/local/client-config/route.ts:120–168` | 必须保留部分成功和准确阶段；不能让配置失败覆盖已知首赠成功，也不能把配置成功等同钱包已就绪。 |
| 当前 fulfill catch 丢错误码；额度链接裸 catch 再把 proof 错误改成通用不可用 | `frontend/src/server/activation/model-benefit.server.ts:265–267`；`frontend/src/server/activation/ai-credit-link.server.ts:129–156` | 精确、安全的绑定恢复码需要沿消费链保留。未知上游 message/action 不能直接获得原生写权限。 |
| allowed 用户不能访问 `/activate` 表单；设置“重新输入激活码”调用 reset | `frontend/src/app/activate/page.tsx:39–40`；`frontend/src/features/settings/activation-reset-control.tsx:38–39` | 新按钮必须是独立无 reset 入口，不能链接 `/activate` 或复用该重置按钮。 |
| `loadModelRouting(true)` 可加入旧 in-flight，且内部吞 GET 失败 | `frontend/src/features/copilot/assistant-engine.ts:79–91` | 机械 `await` 后不能宣称模型 UI 已刷新。要获得本次升级后有效的新观察/明确错误；保留原偏好，不 PUT 路由。 |

### 正式永久许可的真实表示

- Rust 的 `mode_of(expires_at)` 在 `expiresAt=null` 时返回 `perpetual`，否则返回 `trial`（`license.rs:196–217`）。这是历史展示分类，**不是** Activity `TRIAL/DEVICE_TRIAL` 模式，也不是模型权益政策分类。COUNT 也可能无到期日，不能用这个字段授予“永久码”资格。
- Activity `ActivationCode.licenseMode` 是字符串，默认 `TIME`；生成请求当前支持 TIME/COUNT/TRIAL/DEVICE_TRIAL，而不是独立 PERMANENT 枚举（Activity `prisma/schema.prisma:42–70`、`src/lib/license-status.ts:1`、`src/lib/admin-code-generation-contract.ts:62–70`）。
- TIME 允许 `validDays=null`；首次激活无有效天数时写 `expiresAt=null`。已使用且 `usedBy` 空的恢复分支只改绑定字段，不重算 expiresAt（Activity `license-generation-service.ts:89–108, 145–154`；`license-activation-flow-service.ts:99–140`）。历史永久可表现为 TIME + 无实际到期；具体存量类型仍由 Activity 权威记录及 `getActualExpiresAt` 判定，不能仅看本机 TIME。
- 当前普通生成器产生 16 位大写十六进制码（Activity `license-generation-service.ts:48–49`）。这不证明全部历史码长度/前缀相同；客户端只取原保存码并走正常权威识别，不从码文本猜资格，不硬加该格式校验。
- 正式 proof v1 权威只准有效、已激活 TIME/COUNT；原自配渠道与 null 渠道沿既有统一资格。Creator v1 proof 精确字段没有 licenseMode，验证固定 policy、scope、绑定身份、签名、nonce、截止（Activity `model-benefit-proof.ts:122–143`；Creator `model-benefit.server.ts:14, 68–90`）。不修改 v1 bytes 或自行新增 PERMANENT policy。Creator 某处允许 `PERMANENT` 的兼容判断不构成 Activity 会签发的证据（`client-config.server.ts:1467`）。

### 旧绑定缺失及普通 activate 限制

Activity `model-benefit-proof.ts:145–169`：无设备记录且 `usedBy` 空，proof 返回 `MODEL_BENEFIT_BINDING_STALE`；存在墓碑也不能回退 usedBy。正常 status 不补这个缺口（`license-device-binding-service.ts:132`，`license-code-access-service.ts:50–80`）。因此允许进入 App 与当前模型绑定有效必须分开。

`MODEL_BENEFIT_BINDING_STALE` 同时覆盖无绑定、墓碑和设备不匹配，**单凭现有错误码不能证明可恢复**。Creator 可把它投影为“需要核对原绑定”，但能否安全补齐必须由新专用 path 内的权威分支判定；若 Activity 新增精确可恢复错误码，只接受其经审合同，不以中文 message 猜分支。

普通 activate 的事务入口明确传 `allowActiveCodeSwitch: true`（Activity `license-service.ts:134–139`）；预检会执行 `releaseMachineBindingsForCodeSwitch`（`license-binding-preflight-service.ts:50–85`）。只读预查之后再激活仍有竞态，不能向所有用户承诺只恢复原码。服务端必须在同一锁/事务下重新判定目标码、设备、有效期、墓碑原因、同机其他授权；遇其他有效绑定返回明确冲突而不是自动释放。本机特定失效绑定释放授权不能被编码为通用“释放所有旧码”。

## 3. 建议的最小真实消费链

优先复用现端口；以下新增名称是**待独审的本地 IPC/安全投影候选**，不是已有或已经发布的网络 API。

1. 用户在设置点击“升级原激活码，启用模型权益”。UI 以当前 group/account + generation 建立观察，禁双击，保存一次总截止。复用现 local client-config `activation` 消费链，直接执行 **fresh proof → 原 fulfill → config**；已绑定路径不先跑额外 status/目录探查，也不调用原生恢复。
2. 仅当**首次 fulfill 前的 proof 阶段**精确返回旧绑定缺失时，返回安全 `binding_recovery_required`，确认此次尚未发 Growth fulfill，再调用原生固定许可存储的原码恢复能力。不能把 fulfill 后配置刷新报出的 stale 或其他未知错误都映射成恢复重试。没有原码/无法解密/身份不一致，准确说明需要原码或合法恢复流程，不清本地状态、不从 DB/剪贴板补猜、不发新码。
3. 原生执行新专用 path，完成强验签、checked 保存及回读后，继续同一次点击的 local 消费链；其中重新取得的 fresh proof 确认绑定，然后才能首次 fulfill。原生成功只说明许可阶段成功；不能用 status 的 allowed 或旧缓存替代 proof。proof 仍拒绝则停止，保留已完成许可结果，不循环恢复。
4. 原 fulfill 对已有经济对象幂等复用，随后串行读回目录/既有 credential，再刷新当前范围的模型配置 store。此处 `activation` 是用户明确启用原权益，不是伪装启动行为；不得把 startup/scheduled/manual_revalidate 改成经济写。第一次缺绑定的请求不能发 fulfill，因此恢复后的第二条请求才是本次首次履约尝试；未知结果走下节续查，不能再执行整条链当盲重试。
5. 分别展示许可、钱包/首赠、配置同步结果。已有钱包保留余额，原首赠不再发；配置失败时保留“权益已就绪，配置待同步”。不得静默改用户自配/Codex 偏好。手动打开额度页失败时显示安全的绑定/权益状态，不退化为同一通用红字。

不建议把全部升级编排搬进 Rust 后再绕过当前账号上下文调用业务服务。Rust 负责可信许可恢复；Node 的现受控 service port 负责模型权益及凭据写入；UI 负责一次点击的可取消观察和当前范围展示。原生中的既有 license-sync 是展示副本，不承担模型钱包业务。

## 4. 新增原生 IPC 候选合同

建议一个无参窄命令 `license_restore_saved`。这是候选名，须随服务端专用 path 的 wire 一起独审。默认不增加第二个 status IPC 或持久 operation/journal；是否需要由 Activity 用实际响应丢失反例裁决。

| 项目 | 候选要求 |
| --- | --- |
| 调用 | 仅由明确升级点击、精确 pre-fulfill 缺绑定分支调用。读取固定 `.license`，不接受 code/machine/project/path/url/force/release-list。以当前宿主身份和保存原码访问新专用 path；服务端在事务内决定是否可无冲突恢复。不能通过前端指定某种错误就跳过原生/服务端资格判断。 |
| unknown 续查 | 先由现只读模型端口取得原对象 fresh proof；成功才确认当前绑定存在，不能拿 status active 代替。若原生落盘仍未确认，要用真实只读签名许可结果完成 checked 保存回读，不能仅凭 fresh proof 宣称本地已保存。证明仍缺失/不可读则保 unknown 或准确冲突，不自动再发恢复写。Activity 如证明原对象查询不足，再补最小操作引用/续查合同和写集。 |
| 返回值 | closed schema：版本、`phase`、`status`（ready/pending/blocked/unknown）、安全固定 reasonCode、可公开的原许可结果（mode/expiresAt 等现 GateDecision 安全字段）、`retryable`。ready 只表示原生许可阶段完成，不表示钱包或配置完成。默认无操作引用；只有真实反例与服务合同需要时才另审增加。 |
| 保密 | 不返回码、机器标识/摘要、绑定原始引用、签名、密钥或原始上游 body。日志仅固定阶段/结果；不记录请求和整份快照。错误 message 使用本地安全文案，不透传任意原生网络异常。 |
| 互斥 | 单独升级 operation guard 去重，锁顺序固定为升级 guard → 原许可 chain_lock；不持 chain_lock 再调用已持锁函数。在锁内读取当下快照并调用抽出的内部许可链，保存前重核同一原对象。UI 取消仅撤销观察资格，不能释放正在提交的原生写锁或声称撤销已发 IPC。 |
| 持久化 | checked 写 + 回读，旧值不变/新值已落地/无法确认三分；不 reset、不移动其他数据。优先按当前保存原对象和 fresh proof 收敛；不为形式引入永久操作日志或明文码文件。若真实反例要求保存候选/操作引用，必须同主密钥加密、绑定原身份，写集另行精确补齐。 |
| 副作用 | 此命令不调用旧 `license_activate` 包装器、不发异步 Activation 配置同步、不发模型 fulfill；仅复用其内部请求/验签/保存能力。普通 activate/status 原语义不变。无需为了本功能 relaunch；若实际宿主 token 模式变化确需重启，先保存结果、准确提示，不在恢复码成功前关进程。已 allowed 的当前用户不能照搬 ActivateForm 的无条件 relaunch。 |
| unknown | 请求发出后丢响应、验签不通过、保存结果不明，均不能归类“未发生”。先查原对象 fresh proof，不重新提交写；签名 nonce 的技术重试也必须服从专用 path 对原对象的幂等保护，不创建新恢复/释放。 |

**不能直接修改 LicenseOp::Status 使其兼具恢复写，也不能在 `license_check` 后隐式 activate。**原生运行期 gate、强验签和保存真实性是准入条件；离线 grace 只能继续用 App，不能据此显示升级成功。

## 5. 需要 Activity / Growth 冻结的最小合同

### Activity：尚不能由客户端补足的前置

1. 使用独立的受签名、fail-closed 专用 path；旧 activate 可能忽略新增字段，不能复用其 URL 加参数冒充安全保护。明确真实路径、method、签名 target、请求/响应 exact fields、版本及 nonce。本文不发明可调用路径。
2. 服务器由原码 + 当前设备 + 原项目定位原授权；同事务锁内保护另一有效绑定。允许的“失效”必须由权威状态定义，不能前端传 release-list 或把所有墓碑当可恢复。正常迁移/换机/多设备规则不放宽。
3. 保原永久/实际到期/次数/撤销状态；恢复不能重新开始 TIME 有效期、年卡 term 或试用截止，也不能消费 COUNT。旧原权益稳定标识不能因补设备行而无依据变成新经济身份。
4. 专用恢复对原对象的幂等保护；响应丢失优先由原对象 fresh proof 确认绑定，单纯 status allowed 不足。只有 Activity 用真实反例证明 fresh proof 加正常只读签名许可回读仍不能收敛，才引入最小操作引用/持久化；不泛加 operation 系统。
5. 明确安全错误码：缺本地原码、缺可恢复原绑定、另一有效授权冲突、身份不匹配、过期/撤销、待确认等，Creator 只接受白名单投影。提供真实发行签名向量与并发锁测试，不用手填 fixture 冒充跨仓 PASS。

### Growth：经济结果与恢复

- Growth 已确认正式历史永久 TIME 的经济 v1 覆盖，不需要改码/批量发款。保持正式 TIME/COUNT（含合法永久、原自配/null 渠道）的同一资格和原权益归属；不由客户端猜编码或改 policy。
- 恢复前后使用同一已有 Key/钱包/唯一首赠账本；首次合格权益沿已批准政策，不补差、不重发。首赠金额/历史对象匹配以 Growth 最终清单与真实结果为准，不把尚未批量履约写成无历史资格。
- 确认现 `directory`、`credentials` 全状态 existing-only 零经济写，包括 provider Key 缺失和查询 unknown。返回 ready/not_configured/unverified/provisioning/unknown 的准确含义；`not_configured` 不能自行解释为“此前 fulfill 未发出”。
- Root 转达 Growth 最新确认：正式 fulfill 以原 `entitlement + service` 作业务幂等，已有 unknown 只 recover 原预约，不产生新 provider POST。Creator 应复用该实际能力，不因 `post()` 的随机请求幂等头（`model-benefit.server.ts:141–143`）误判服务端没有防重机制，也不另建经济账本或强加持久 journal。验收要确认原权益身份跨恢复稳定，并消费服务端真实恢复向量。
- 响应丢失先以 fresh proof/credentials 查原对象；已有 ready 只续配置。仍是 unknown 时，在同一次明确升级范围内，允许沿 Growth 已确认的同权益/同 service 恢复原预约合同继续，不创建新预约或新 provider POST；不能改原经济身份把它当首次 start。若权威仍不能收敛，保 unknown 和可继续状态，不追加操作编号或多个确认步骤。

T-1422 的正式 v1 保持、试用 v2 与恢复对话框仍为独立已冻结候选。本功能若以后基于其集成，必须重新绑定合并后源码与 Gate；不能把它当成正式 TIME 旧绑定恢复已经完成，也不在本审计中修改其隔离树。

## 6. 结果串行、预算与 UI 刷新

建议阶段为 `verifying_binding → restoring_license(仅精确缺绑定时) → verifying_binding(恢复后) → fulfilling → syncing_config → refreshing_store`。已绑定直接跳过恢复两步。各阶段记录已知事实；晚到结果不得回写新 group/account、换码后的身份或已关闭观察。双击共用/读取原对象的在途结果，不产生第二原生恢复或第二经济写。

恢复/履约发出后的取消文案是“停止等待，结果仍需核对”，不是“已取消激活/已撤销赠额”。重新进入先查原对象 fresh proof 和既有 credentials，不因 JS 状态丢失创建新经济操作。确需再次 restore 时，能否由“同对象已绑定零写/no-op + 预检精确集合 fence”收敛由 Activity 独评；只有具体反例才新增持久 op，不能盲 activate。启动可只读取/提示未决结果，不自动 restore 或赠额。

现有单阶段预算：普通模型配置读 370000 ms、activation 配置观察 730000 ms（`license.rs:2662–2674`）；原生许可请求每次 120 秒、至多 3 次，mirror 另最多 120 秒；当前模型 routing 有自己的共享观察上界。新的组合不能沿用一个 730000 ms 却让多阶段在后台无限续期。应按 LED-053 从真实允许的阶段上限组合**一次总预算**并加收尾时间，阶段加入共享 flight 不刷新原 deadline，父截止更早则结束当前观察。确切新总预算要在实现合同及 timeout-policy 中冻结；长操作不阻 App 其它功能。

模型 store 刷新必须返回本次有效观察成功/失败，不能机械 `await loadModelRouting(true)`：它可能 join 升级前 GET，并吞掉失败。最小补齐应使升级完成后的新一轮读取有明确 scope/generation 与结果；旧读可安全收尾但不能覆盖新读。不重复无界 GET、不取消其他合法读者、不改 PUT 偏好。UI 只有读回成功才显示“模型配置已同步”，失败保留“权益已就绪、配置待核对”。

## 7. 拟增最小产品与测试写集（尚未准入）

以下是需 Root 纳入 Packet §6 并独评后的候选，**本轮均不写**。现 Packet 只准文档/控制面，不能据本文直接开工。表内涉及原生新合同的文件不能漏列为“仅两个 TS 文件”。

| 路径 | 必要变化与测试归属 |
| --- | --- |
| `frontend/src-tauri/src/license.rs` | 新恢复内部能力/无参 IPC、checked 保存回读、在途 guard、安全 typed 结果；不触发旧异步 Activation。优先在现 `#[cfg(test)]` 注入 Http/Clock/SnapshotStore 测试，保旧许可回归。若规模确需独立模块，先改写集，不能默增文件。 |
| `frontend/src-tauri/src/lib.rs` | 注册新命令及必要原生状态；不改机器 ID 算法或 reset。 |
| `frontend/src-tauri/build.rs` | 在 app manifest commands 中生成新 IPC permission。 |
| `frontend/src-tauri/capabilities/remote-sidecar.json` | 仅为既有主窗口 sidecar origin 增加精确的新 IPC permission；不加 shell 或任意远程域。 |
| `frontend/src-tauri/permissions/autogenerated/license_restore_saved.toml` | Tauri 生成工件，随真实构建确认产生内容；不手造生成器收据。若最终 IPC 更名同步改准确路径。 |
| `frontend/src/server/activation/model-benefit.server.ts` + `.test.ts` | 精确绑定恢复错误、只读探查结果、保履约部分成功和经济 unknown 语义；formal v1 bytes/scope 不变；真实权威向量消费。 |
| `frontend/src/app/api/v1/local/client-config/route.ts` + `.test.ts` | 原触发器边界、明确阶段/typed 恢复投影、部分成功保留及不二次履约；仍空 POST、handshake、账号上下文。复用当前只读 trigger 时不必新增端点。 |
| `frontend/src/features/settings/channel-model-configuration.tsx` + `.test.tsx` | 一键串行旅程、mock 新 IPC、明确恢复与 unknown 续查、取消/换组/迟到隔离、既有偏好保留。不得调用 reset 或把原码送 JS。 |
| `frontend/src/features/copilot/assistant-engine.ts` + 新增 `frontend/src/features/copilot/assistant-engine-model-routing-refresh.test.ts` | 刷新 store 的明确新观察/结果端口与竞态测试。原 `assistant-engine-server.test.ts`、`use-assistant-engine.test.tsx` 作为既有回归读集；默认不写。当前 `loadModelRouting(true)` 不足以作成功凭据。 |
| `frontend/src/server/activation/ai-credit-link.server.ts` + `.test.ts` | 保留白名单 proof 绑定错误，其他异常仍安全通用；避免升级入口修完额度页仍误报同一“服务不可用”。 |

专用 path 已确定必须新增，因此还必须准入 `frontend/src-tauri/secure_strings_build.rs`（真实文件在 crate 根）、`frontend/src-tauri/src/secure_strings.rs` 的路径/签名 target 常量与生成关系，不能在 license.rs 写裸生产 URL。具体常量值等待 Activity wire。若新增公共 TS DTO，则应先列现合同归属及必要 consumer 路径，不用 `as unknown` 绕精确类型。打包产物、签名/干净源码要求沿既有 packaging 技能，安装验收另列，不在此写集默许。

不需要改：`ActivateForm`、`/activate` redirect、`activation-reset-control`、机器码生成、原许可/钱包数据、模型路由 PUT、worker/模型消费、数据库 schema。`owned_devices.rs` 仅参考保存回读模式，不能为本任务重做 owned-device 业务。

## 8. 可执行验收矩阵

全部先在隔离树/独立 PGLITE 与 mock 原生/远端端口执行；无真实模型、Key、激活或发款。Activity/Growth 提供真实隔离发行/服务结果向量后再做跨仓消费，不能手填冒 PASS。

| 向量 | 必须断言 |
| --- | --- |
| TIME 永久、TIME 有期限、COUNT 有剩余 | 正确 formal v1；保持 null/原实际到期/原次数；不把 COUNT 或当前 TIME 凭本地展示一律当永久。 |
| 已有 Key/钱包/首赠 | 只复用；首赠 ledger 增量 0，余额不补差，配置不改个人偏好。 |
| 首次合格未履约、原自配/null 渠道 | 真实统一资格；唯一首次履约；原生恢复与 Node fulfill 不并发重复。 |
| usedBy 空、设备 0 | pre-fulfill proof 拒绝后，新专用 path 精确判定可恢复；status allowed 不冒有效绑定；安全恢复后 fresh proof 才继续。 |
| 另一有效授权、墓碑/撤销、过期/次数耗尽、多设备 | 服务端锁内拒绝或按真实规则处理；客户端不 force、不批量释放、不更换码、不延长原期。 |
| 并发恢复/双击/启动心跳/另一窗口换码 | 固定锁序，无重入死锁；不读锁外旧码；同原操作一次写；迟到结果不落错当前身份。 |
| 原生无文件/错误密钥/明文旧快照/机器项目不一致 | 无秘密回传；只能走真实强验签权威恢复；不能把本地可解析或 allowed 当模型资格。 |
| 签名、target、digest、date、nonce 错误 | 不放行新升级结果；保原本可用许可的正确状态；未知请求不冒“未发送”。 |
| 写失败、replace 后 fsync 失败、回读旧值/新值/损坏 | 保留旧值/确认新值/unknown 三分；不伪报保存完成；未核实本地落盘不冒完整成功。 |
| 恢复写/fulfill 响应丢失、进程退出重启 | 先查原对象 fresh proof/既有凭据；同 entitlement/service 的 unknown 只 recover 原预约、新 provider POST=0；不换经济身份重投。再次 restore 的 no-op/fence 与持久 operation 是否必要以 Activity 真实反例决定。 |
| 许可恢复成功而 proof/fulfill/配置分别失败 | 精确保留许可/经济部分成功；不回滚或重复原赠额；额度入口显示安全可执行原因。 |
| 旧 routing GET 延迟 + 升级完成、GET 失败、换组 | 新读取明确结果；不能 join 旧读后报成功，旧回调不能覆盖当前组。 |
| 取消/关闭窗口/父截止先到 | 只停止观察，不虚假撤销 IPC；不续预算，不阻 App；之后只读继续。 |
| T-1422 试用 v2/正式 v1 | 集成后完整回归不放宽；每设备一次5元、跨码防重和过期不恢复不变，正式恢复不伪装试用。 |

实现准入后跑任务 Packet 的聚焦 TDD、原许可/经济/配置回归、完整 6144 MiB/并发 1 typecheck、quality、timeout-policy、boundary 和独立审核。真实 App 按钮旅程、打包安装、当前机器限定释放、其他用户分发及生产部署分别出证据；受控组件/源码审计不冒充真机通过。

本文交付状态：**契约候选已具体化；服务端原子恢复/unknown 查询 wire 待 Growth/Activity 独审确认，产品源未实现。**
