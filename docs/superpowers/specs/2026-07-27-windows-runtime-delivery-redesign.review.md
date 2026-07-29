# T-565 SPEC 独立评审记录

## Round 1

- 日期：2026-07-27
- review_mode：cross-model
- reviewer：`gpt-5.6-sol`
- verdict：FAIL
- 输入：spec-reviewer prompt + 产品宪法 + T-565 SPEC

### 原始结论

方向符合 CreatorOS 的 Windows 桌面交付定位，现成方案与仓内证据也较充分；但 SPEC 明确携带
尚未验证的致命低成本假设申请签核，且升级回滚、签名信任和卸载语义仍不足以形成可执行契约。

### Findings 与处置

| 严重度 | Finding | 处置 |
|---|---|---|
| blocker | RAT-565-01/02 是便宜且致命的假设，却未在 Product Gate 前运行 | 接受。已新增机器 prune、TDD 与真实 runtime smoke，证据见 `docs/research/2026-07-27-windows-runtime-prune-rat-evidence.md`；16,381 文件仍不冒充最终目标 |
| major | current 切换后仍可能在 register/GUI health 失败，缺 pending/healthy/rollback 协议 | 接受。修订为 installer 单协调者、pending set、安装壳特殊验证模式、最终原子 commit；用户启动永不读取 pending |
| major | 签名 canonical bytes、算法、keyId、信任根、轮换、防重放与两类 hash 不明确 | 接受。固定 Ed25519 + RFC 8785 JCS、内置信任 key ring、releaseSequence、防降级、payload/tree hash |
| major | IA 有“可取消”但没有 FR/状态/测试 | 接受并删除。取消不是用户确认范围，不保留假按钮 |
| major | 卸载没有数据保留裁决 | 接受。按产品宪法和既有数据边界采用保守默认：卸载 app/runtime/cache/入口，保留 appData 项目、素材、密钥和日志；只有用户显式选择已有“删除应用数据”动作才删除 |

### 原始 JSON

```json
{"verdict":"FAIL","summary":"方向符合 CreatorOS 的 Windows 桌面交付定位，现成方案与仓内证据也较充分；但 SPEC 明确携带尚未验证的致命低成本假设申请签核，且升级回滚、签名信任和卸载语义仍不足以形成可执行契约。","findings":[{"severity":"blocker","category":"value-viability","where":"§4.4「五大风险与 RAT」及 §18「User confirmation and Gate」","issue":"SPEC 明确把 RAT-565-01/02 称为“致命且可在半天内验证的假设”，却规定评审后才执行，当前没有结果、命令、产物或失败分支回填。若 production closure 无法达到文件数阈值，或动态依赖 smoke 失败，FR-04、NFR-03 乃至所选交付架构都会失效。这属于携带致命且便宜可验的未检假设申请 Product Gate。RAT-565-03/04 因需另行授权的 Windows 环境而延后不构成本 finding。","suggestion":"mitigate：在 Product Gate 前执行并回填 RAT-565-01/02，记录输入产物、inventory、文件数、逐组件 smoke、命令、结果和证据路径；若任一失败，先据结果修订 closure/bundle 方案或回退到已列替代形态，再重新送审。"},{"severity":"major","category":"completeness","where":"§5 FR-PKG565-05/06/07/08、§7 FLOW-PKG565-05、§8 ENT-PKG565-03/04、§16 AC-PKG565-10","issue":"升级事务在“原子 current”之后仍存在创建入口和首次 GUI health 等失败点，但没有定义谁负责回滚、何时把新版本从 pending 提升为 current。FR-07 和 §9 又规定启动壳只报错并要求重跑 installer、不承担修复；RuntimeRegistry 也没有 pending/health 状态，InstallAttempt 没有 register/first-health/rollback 阶段。因此“升级任一步失败 current 不变”和“新 runtime 启动失败可恢复 lastGood”无法按现有状态机同时实现。","suggestion":"在 CONTRACT 中选择并固定唯一提交协议：例如由 installer 保持协调权，先写 pending set、完成真实 GUI health 后再提交 current；或明确 post-switch 失败时由 installer 原子恢复 lastGood。补齐 pending/healthy/rollback 状态、负责进程、崩溃恢复规则和故障注入测试，同时保持首启不下载、不解包。"},{"severity":"major","category":"completeness","where":"§5 FR-PKG565-03/05、§6 NFR-PKG565-07、§8 ENT-PKG565-01/02","issue":"签名与哈希字段尚不足以构成可实现的供应链契约：未定义 manifest 的规范化签名字节、签名算法标识/可信公钥来源/密钥轮换，未定义旧版合法签名 manifest 的重放或降级拒绝规则；RuntimeLayer 的 contentHash 与 sha256 各自散列压缩 payload、解包目录还是 canonical inventory 也不明确。这会直接影响缓存复用、篡改检测、兼容集合和 Web/Offline 等价判断。","suggestion":"mitigate：以最小安全契约明确 canonical serialization、签名覆盖范围、算法与 keyId、内置/轮换信任根、appVersion/shellCompatibility 的防降级规则，并分别定义 payload hash 与解包树 hash 的语义和校验时点；为篡改、旧 manifest 重放、错误密钥及解包后树不一致增加负向验收。"},{"severity":"major","category":"traceability","where":"§9 IA-PKG565-01 的“可取消状态”、§8 ENT-PKG565-04、§17 Traceability seed","issue":"安装器展示可取消状态，但没有对应 FR、取消操作、状态枚举、清理/缓存保留语义或测试映射；InstallAttempt.status 也没有 cancelled。实现者无法判断取消在 acquire、materialize、smoke、switch 各阶段是否允许，以及取消后 current、staging 和快捷入口应处于什么状态。","suggestion":"把已出现的取消交互追溯到一个明确 FR，并为每个可取消阶段定义终态、原子性与清理规则；补充 cancelled 状态和故障测试。若不准备交付真实取消，则删除该 IA 控件描述，避免假按钮。"},{"severity":"major","category":"traceability","where":"§16 AC-PKG565-12“卸载全部通过”","issue":"卸载被列为正式验收，但全文没有对应 FR、FLOW、数据保留决策或可反驳的通过标准。尤其未说明卸载 runtime、layer cache、日志、快捷入口时是否保留 appData 中的项目、素材和密钥，存在不可逆数据损失风险。","suggestion":"escalate：由人明确裁决卸载时用户数据的保留/删除边界；随后增加最小卸载契约与测试，分别断言应用/runtime/cache/入口的处理结果以及领域数据 hash 是否保持。"}]}
```

Round 1 findings 已全部接受；修订后进入 Round 2，不把 Round 1 FAIL 改写为 PASS。

### Round 1 修订 scope-budget Gate

```text
Gate: scope-budget
Status: pass
Evidence: 正文约 533 → 631 行（+18.4%，未超过 20% 告警线）；新域 0、新表 0、
          SERVICE_CONTRACT 新操作 0、新 role 0、新 ENT 0。
          --creatoros-verify-runtime-set 是同一安装事务内的壳进程私有验证模式，属于
          HARD-PKG565-03 的正确性深度，不是公开服务操作；FR-11 只把 Round 1 前 AC-12
          已存在的卸载验收补成可追溯契约，没有新增产品面。
Findings: 未触发范围预算；签名/事务字段是安全与不可逆数据保护所需的窄接口正确性。
Decision: 继续 Round 2。
```

## Round 2

- 日期：2026-07-27
- review_mode：cross-family
- reviewer：`gpt-5.6-sol`
- verdict：FAIL
- findings：1 blocker + 3 major

### Findings 与处置

| 严重度 | Finding | 处置 |
|---|---|---|
| blocker | 壳/入口先替换、runtime current 后切换，崩溃可形成新壳 + 旧 runtime | 接受。改为稳定 launcher + 版本化 shell/runtime compatibility set；快捷入口永远指 launcher，pending smoke 后只原子切 active set |
| major | 0.2.0 旧 tar 没有新签名 layer，首次升级“复用已验证 layer”不可执行 | 接受。删除错误承诺；首次迁移必须取得全部新 layers，旧壳/runtime 作为 legacy fallback 保留到提交成功 |
| major | 3 次样本不能称 P95 | 接受。删除 P95 表述，改为 Win10/Win11、Web/Offline 各单元 3 次全部不超过阈值，并定义冷启动/计时边界 |
| major | CDN 商业风险只有报告，没有通过/否决阈值 | 接受。增加首装 500 MiB、core-only 更新 100 MiB、每成功安装 US$0.10 的阻断/复决阈值与复核时点 |

### 原始 JSON

```json
{"verdict":"FAIL","summary":"双安装器方向与少文件化目标合理，但升级事务仍存在壳与 runtime 非原子切换的发布阻断，并缺少旧版迁移契约和可判定的 P95、商业成本门槛。","findings":[{"severity":"blocker","category":"approach","where":"FR-PKG565-05 步骤 3–6、SCN-PKG565-03/04、AC-PKG565-10/14","issue":"SPEC 在提交 runtime current 之前就“安装壳、注册卸载信息和启动入口”。若进程在壳文件或入口已替换、但 pending smoke 或 final registry replace 之前崩溃，可能形成“新壳 + 旧 current”的不兼容组合。现有恢复条款只处理 pending/cache，没有证明旧壳和旧入口能恢复，因此无法满足“升级失败后旧版本仍可启动”和逐点 crash 验收。","suggestion":"mitigate：把壳与 runtime 定义为同一个版本化 compatibility set，通过稳定 launcher/单一激活指针在 smoke 后原子切换；或明确壳文件、注册项和入口的持久回滚日志及崩溃恢复协议。补齐每个壳/注册写点前后 crash injection，断言失败时旧入口仍启动旧壳与旧 runtime。"},{"severity":"major","category":"completeness","where":"§4.1 Q4、FR-PKG565-08、FLOW-PKG565-05、§10 现网事实","issue":"Q4 声称现有 0.2.0 用户升级时可“复用已验证 layer”，但现网事实表明旧版只有 sidecar.tar.gz、runtime-current.txt，既没有签名 layer manifest，也没有新 bootstrapper/registry。SPEC 未定义旧 updater 如何可信地交接新安装引擎、旧 runtime 如何被验证为 layer，或首次迁移是否必须重新取得全部 layers，导致已安装用户的首个升级路径不可执行。","suggestion":"增加明确的 legacy-to-layer 迁移契约：由旧版 updater 验签并启动哪个新 bootstrapper、失败如何继续保留旧版、用户数据如何保持不变；若旧 runtime 不满足新签名与 inventory 信任链，就明确首次升级重新取得全部 layers，不宣称复用。补一条 0.2.0 已安装态到新 current 的真机验收。"},{"severity":"major","category":"completeness","where":"§4.9 Success signals、NFR-PKG565-01/04、AC-PKG565-08","issue":"“P95 ≤5 秒”配套检验仅写“3 台/次冷启动”，物化 P95 也未给样本量和聚合口径。三个样本无法形成有意义的 P95，且未说明 Win10/Win11、Web/Offline、机器之间如何分层聚合，因此发布 Gate 可以在相同数据上得出不同结论。","suggestion":"为每个 P95 指标规定样本量、冷启动定义、机器/OS/安装器分层和统计方法；至少使用足以计算 P95 的独立样本。若只计划做 3 次，则把指标改为“3 次全部不超过阈值”，不要称为 P95。"},{"severity":"major","category":"value-viability","where":"§4.1 Q5、§4.4 商业风险、§4.5 采纳门槛、§4.6 商业假设","issue":"商业风险写了“发布前量化”和“流量成本不通过时调整”，但没有定义什么数值算不通过，也没有以正式风险接受记录说明即使超出某成本仍可发布。当前检验只能产出流量报告，不能支持采纳或否决决策，不满足价值与生存性风险需要证据及检验方式的锚点。","suggestion":"二选一：mitigate——给出每次首装/典型更新的 CDN 流量或单位用户成本上限及超限动作；accept——登记明确的成本暴露范围、责任人、复核时点和触发重新决策的阈值。无需新增产品能力。"}]}
```

Round 2 findings 全部接受；Round 3 是本工件最后一次原地复审机会。

### Round 2 修订 scope-budget Gate

```text
Gate: scope-budget
Status: pass
Evidence: 正文 631 → 约 675 行（+7.0%）；新域 0、新表 0、SERVICE_CONTRACT 新操作 0、
          新 role 0、新 ENT 0。stable launcher、legacy fallback、compatibility set 是
          HARD-PKG565-03 同一安装原子性的必要深度；性能/成本只把已有 Gate 变得可判定。
Findings: 未触发范围预算。
Decision: 进入最后一轮 Round 3。
```

## Round 3

- 日期：2026-07-27
- review_mode：cross-family
- reviewer：`gpt-5.6-sol`
- verdict：FAIL
- findings：2 blocker + 3 major

### Findings 与裁决

| 严重度 | Finding | 裁决 |
|---|---|---|
| blocker | 干净新装在 commit 前创建 launcher/入口，失败后会留下无 current 的入口；新装与升级顺序未分开 | 接受；不在本工件继续打补丁，返回 PLAN 重写双状态机 |
| blocker | manifest 只有 shellEntry，没有壳 payload URL/size/payload hash/tree hash，无法建立下载前信任锚 | 接受；返回 PLAN，把壳作为唯一签名 ShellArtifact 或必需 layer 重建契约 |
| major | layer payload 格式、目标根和 Windows 路径穿越/ADS/设备名/reparse point 规则缺失 | 接受；返回 PLAN 后作为 NFR-SECURITY 必需约束，不作为新产品能力 |
| major | “原子 registry replace”没有选定真实文件/Registry blob、锁、flush、ACL、损坏恢复 | 接受；返回 PLAN 先做 Windows 持久化原语 RAT 再选型 |
| major | 默认卸载后是否保留 maxAcceptedReleaseSequence 高水位不明确 | 接受；返回 PLAN 固定安全元数据与领域数据的独立保留边界 |

### 原始 JSON

```json
{"verdict":"FAIL","summary":"方案方向与产品定位一致，价值、现成方案调研和范围控制也较完整，但干净安装失败语义及壳文件签名契约存在两处核心断裂，当前状态无法安全、无歧义地进入 BUILD。","findings":[{"severity":"blocker","category":"completeness","where":"FR-PKG565-05 第 3～6 步、SCN-PKG565-03、AC-PKG565-02/14","issue":"FR-05 要求在 pending set smoke 和 final commit 之前安装稳定 launcher 并更新快捷入口；但 SCN-03 要求失败时“没有新版本快捷入口”，AC-02 又要求新装失败不显示完成。干净新装没有 legacy/current 可供 launcher 启动，因此 smoke 前写入快捷入口、随后 smoke 失败，会留下指向无有效 current 的新入口，与 fail-closed 验收直接冲突。","suggestion":"把新装与升级写成两条确定性顺序：新装只在 final commit 成功后创建快捷入口和卸载登记；升级始终保留既有入口，pending 阶段不得改入口。补充 launcher 写入、current 提交、快捷入口创建三个崩溃点的明确恢复表，并同步修正 FLOW-01/02/03 与 AC-14。"},{"severity":"blocker","category":"approach","where":"FR-PKG565-03/05、ENT-PKG565-01 RuntimeManifest、ENT-PKG565-03 RuntimeRegistry","issue":"FR-05 声称版本化 Tauri 壳“与四个 runtime layers 一起由 manifest 签名并按 canonical inventory 校验”，但 RuntimeManifest 只有 shellEntry，没有壳 payload 的 URL、大小、SHA-256、tree/inventory hash 或其他签名覆盖描述。RuntimeRegistry 中安装后生成的 shellSha256 不能提供下载前信任锚。Web 安装器因此无法依据当前契约安全取得并验证与 runtime 匹配的壳，也无法证明 Offline/Web 使用同一 compatibility set。","suggestion":"在签名 manifest 中加入唯一的 ShellArtifact 描述，至少固定不可变 URL/离线资源标识、compressed/unpacked size、payload SHA-256、tree/inventory SHA-256 与 entry；或者把 shell 定义为受同一规则约束的必需 layer。确保这些字段进入 JCS 签名输入，并把 Web/Offline 等价、篡改和壳/runtime 混搭测试补入 AC-01/06/10。"},{"severity":"major","category":"completeness","where":"FR-PKG565-03/04、ENT-PKG565-02 及 canonical inventory 说明","issue":"Layer 契约没有定义 payload 格式、每层物化根目录和路径冲突规则；同时 inventory 明示允许 symlink target，却未规定绝对路径、`..`、NTFS ADS、保留设备名、大小写碰撞、junction/reparse point 或越界 symlink 的拒绝规则。仅在物化后校验 tree hash，不能阻止解包过程中先写出 staging 之外，未满足宪法 NFR-SECURITY 的 containment/realpath 要求。","suggestion":"采用 mitigate：在 CONTRACT 固定 payload 格式和各 layer 的目标根，解包前验证完整 inventory；拒绝绝对/父级/ADS/设备名/大小写碰撞及 staging 外目标，默认禁止 reparse point、junction、hardlink 和 symlink，确有消费者时逐项 allowlist。增加恶意路径 payload 的负向验收，断言安装目录、旧 set 与用户数据均未被写入。"},{"severity":"major","category":"approach","where":"FR-PKG565-05 第 5 步、ENT-PKG565-03、FLOW-PKG565-05","issue":"核心提交原语只写成“一次原子 registry replace”，但没有说明 RuntimeRegistry 是 Windows Registry 多值、单值 blob 还是磁盘文件，也没有定义跨进程锁、durability/flush、损坏恢复和读写权限。若 current、lastGood、installedSets 与 maxAcceptedReleaseSequence 是多个 Registry value，就不能从现有文字推出它们会作为一个原子状态提交；该语义却是禁止“新壳 + 旧 runtime”的核心前提。","suggestion":"选择并写死一个可实现的单提交原语，例如同盘生成完整 registry JSON、fsync 后用 ReplaceFile 原子替换，或单一受保护 Registry blob；补充单写者锁、ACL、schema 校验、损坏时只读 last-known-good 备份和断电恢复语义。AC-14 应对真实持久化原语做进程终止/断电近似测试，而不只测内存状态机。"},{"severity":"major","category":"traceability","where":"FR-PKG565-03、FR-PKG565-11、FLOW-PKG565-06、NFR-PKG565-07、AC-PKG565-06/12/15","issue":"防降级依赖本机 maxAcceptedReleaseSequence，但默认卸载删除 runtime/entries 后是否保留该高水位没有契约或验收。若 RuntimeRegistry 随 runtime 被删除，用户默认保留领域数据后仍可运行旧的有效签名 Offline Installer，使“旧 releaseSequence 100% 拒绝”失效；现有卸载 AC 只校验用户数据保留，没有覆盖高水位。","suggestion":"明确 maxAcceptedReleaseSequence 的持久化位置、ACL 和卸载策略：默认保留数据的卸载必须保留高水位，显式删除全部应用数据时再说明防降级边界。补“安装新版→默认卸载→运行旧 Web/Offline installer”的验收，要求在取得任何旧 payload 或改写入口前拒绝。"}]}
```

### STOP 裁决

同一工件已完成 3 轮“修复 → 独立复审”且 Round 3 仍有 blocker。按
`product-to-code-orchestrator` spec-reviewer 的 STOP 上限，本工件不得继续原地修订，也不得
进入 BUILD；返回 PLAN，以本记录和 RAT 证据为输入重做事务/信任模型。历史三轮 FAIL 全部保留，
不改写为 PASS。
