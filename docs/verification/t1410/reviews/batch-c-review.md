# T1410 批次 C 独立规格审核说明

审核日期：2026-10-25。审核者为与实现/主控制面分离的独立会话 `/root/t1427_contract_review`；未核实精确模型名称。只读当前 SPEC、适用宪法、原 finding 和来源裁决，仅写本批审核交付物；未修改产品、SPEC、审核引擎或状态控制面，未调用真实业务。

结论：当前七项规格未发现新的阻断性合同缺口。五份 initial 可供原计划的新周期使用；T694/T652 另外保留旧 finding 的 recheck 原件与完整 initial 备用包。正式 record、typed 授权、周期选择和最终 receipt 由主会话在规定流程中执行，本说明不宣称这些操作已经完成。

## 绑定与历史

| 任务 | 当前完整 SPEC SHA-256 | canonical receipt / cycle-round | 本次交付 |
| --- | --- | --- | --- |
| T-691 | `a4a57d75e372b01db3c0880f6791b98971a98d0abb44a3b29c07c1723752e232` | `9444ca5b32a9` / 1-3 | T-691.json |
| T-694 | `bc30c20b81ec2878318b516384c23d76bc3bec396d0beb23ce0dc1d5e374cddb` | `2c7be136aea0` / 1-2 | T-694.recheck.json；T-694.initial.json（备用） |
| T-656 | `a6a56eb9bdb5c7b19e59fee6bef2c8f8fdbca2d4276f1b49d7a9c7ea049bc1ac` | `5f6970ac76f2` / 1-3 | T-656.json |
| T-652 | `95911e86fb467094feff7b2bd997d1b9ce2bd2e1cbe9dedc4862517ae5f7bdea` | `2089334662f3` / 1-2 | T-652.recheck.json；T-652.initial.json（备用） |
| T-645 | `d2e9fbef2dcb8228b3652d5f269024eada6cafbf62c03ec61ba26ad6e4418fd1` | `5dfe24b42eb7` / 1-3 | T-645.json |
| T-642 | `53794304623a79d9f7b7890edfd90b3e4bdc7c492d751b6ee50f4fb7b0455348` | `7728c9ed44bd` / 1-3 | T-642.json |
| T-635 | `5849ba840ce1352b97eb47a8d72b77397737242621d7e32170e2cd9e2a8d9402` | `b8add273a494` / 1-3 | T-635.json |

原 canonical 事件、旧 SPEC/宪法 hash 及 foreign snapshot receipt 由 `docs/verification/t1410/canonical-repair-plan.json` 保留；foreign 原件在 `docs/verification/t1410/foreign-snapshots/`，未把其 PASS 当作本轮结论。T652 使用迁移后的 task-scoped event `e7fb9f7b45d1b33e5a010e2649f6e149c492971f48cd5ce5d692b75a6cbbefc5`，没有退回共享 snapshot。

本次对当前完整 SPEC 逐段重审；对当前 `PROJECT.md` 的产品定位、治理和架构指向，以及 `AGENTS.md`、`orchestrator/SYSTEM_ARCHITECTURE.md` 的适用边界另行核验。生成态 PROJECT 的任务/模块清单不取代产品约束。T691/T656/T645 的旧 PROJECT 精确生成态原件未找回，不声称已经读过这些不可考的旧全文；没有把无法复现旧 hash 虚构成当前产品缺陷。

| 宪法/治理文件 | 当前 SHA-256 |
| --- | --- |
| docs/产品定位.md | `86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800` |
| PROJECT.md | `e9085d32d6f91bbe1a251b502aeede8c338e95c87c9f809155c159b8b1b0ab13` |
| AGENTS.md | `966350c9181a8b4cd32d03cab4d4516b3c79f9af39f950576ac3e058e0a29f27` |
| orchestrator/SYSTEM_ARCHITECTURE.md | `eb1826d4c09054df622d9718c38ca372bd19833e72bd1a752757631a5747c1df` |
| docs/superpowers/specs/2026-07-23-content-radar-restructure-design.md | `07c9b61b58ca970feff57f1647c30a32c4af4fc92063c9a87952771403376950` |

T691/T656/T645/T635 的旧 PROJECT 绑定哈希分别保留如下；本轮建议新周期稳定绑定 `docs/产品定位.md`，不放宽人工确认、账号隔离、backend 单写者、worker AI 边界、密钥保护及真实发布验收。T642 继续绑定原内容雷达领域宪法，并按已确认 DEC 审查局部覆盖。

- T-691：`6a04d0b0fa6c123f7990f02685afeed38858494cc2501ec4bfbc742050ab97fd`。
- T-656：`d01469220b22455024bd58473a6ca9f307162b1317ba0fa5fe036b148f90362a`。
- T-645：`76e9fa0fa2408bd5f512b640d01ad5a0c550702875abeeb4ddb648a07e0e6bca`。
- T-635：`89a36038833bdaed0d6de3ca353725643aff8aa53e6e0c53933b7ebdf4b1ad9b`。

## 逐项审核与旧问题处理

### T691

核查 lifecycle.read 的 brief/artifact/material/cover/publication/metrics/review 完整性与 bounded window；历史搜索只能按显式意图和当前所有权运行。原 REV-001 的模型伪造确认已由 backend 限时一次性令牌、完整 user/account/project/report/finding/version/conversation 绑定解决。REV-002 的不稳定定位、重叠批量修改与富文本损坏已由 source hash、稳定目标、共享纯映射、重叠拒绝、反向偏移、保留未知字段、唯一新版本和 CAS/幂等处理覆盖。REV-003 的 brief 缺口与 REV-004 的 header/cookie 不一致均有明确读口/拒绝语义和 AC。没有把模型自然语言回复当授权，也没有把完整读取当作跨账号读取许可。

### T694

审查包括渠道包身份锁、受控打包隔离、正式发布前停止点、离线根、keyset/轮换/恢复、三条更新路径、chunk 内容验证、健康检查数据隔离、双平台真实门及传输成本实测。REV-001 的解决依据为 §6.2/§10：初始 root 在 Tauri/Rust 安装物编译期固定，和 PackageIdentity/identity lock/attestation 绑定，在线元数据不能引入信任根；root/updater key 分离，计划轮换双签，疑似 root 失陷需完整安装包。REV-002 的解决依据为 §6.3 三路径表：PendingCurrentShell/PendingTargetShell 明确区分，组合 pending 绑定目标壳/protocol/artifact，下载或安装失败不激活不兼容 runtime，保留可启动 current。AC-694-04/08 的真实失败与单点失陷验收仍必需。

### T656

逐项检查正式 Sidecar bypass 删除、仅开发编译入口允许开发能力、共享严格 seed 格式、smoke 环境继承、Rust 运行时私钥保护边界和最终安装产物扫描。REV-001 由给真实 Sidecar/Next/NCC/Pi/setup/scan 子进程剥离 seed 解决；REV-002 由独立的 macOS/Windows 最终产物定位、解压流扫描和失败关闭解决；REV-003 由 build/smoke/preflight 一致拒绝 sentinel、空白和非规范编码解决；REV-004 使用 Windows runtime-current.txt 的真实安装语义而非虚构 current 链接。规格没有把掩码宣称为不可逆，也没有取消真实签名 smoke 和服务端鉴权。

### T652

全量检查当前单 Copilot 动态路线、逐问证据、可随时形成候选、路线变更、转写部分进展、持久恢复、生成/确认幂等和正式母版事务。REV-001 在 §10/10.1、AC-15 用 candidateRevision、previous statement CAS、幂等回执和同事务版本/current/session 切换解决；REV-002 在 §4.1、AC-14 把从零开始变成物理生成输入边界，只读打开旧资料不写入 manifest，改路线需确认再生成；REV-003 在 §4.4、§12 AC-13、§13 保留动态普通语言选项、自由补充、保存刷新修改及视口验收。2026-08-05 已确认的一条动态路线覆盖旧固定六问门槛，用户可无证据先形成候选；这不授权直接采纳母版、不取消账户隔离、当前版本唯一或历史不可覆盖。

### T645

原 REV-001 的旧 scope 在途执行歧义由 authorityDigest 切换后取消、凭证读取与 provider 调用前校验解决；REV-002 的 scope 算法歧义由 exact Unicode/JCS/域隔离 SHA-256/服务端派生解决。另完整检查当前 OmniHi 受管 authority、前端 RPC 不获密钥权限、worker 临时凭证、配置票据失败的受控本地兼容、每次 ASR lease、未知结果隔离与 Whisper 单次回退。只读核对 Growth `T-135-qwen-asr-direct-client.md` 的 API-282、25,000 额度签发计费、相同幂等键重放、过期不重签、provider_unknown 不重复扣费及安全源地址要求；未调用 Growth/Activity/provider。真实跨仓收款/额度/签发与供应商旅程仍按原合同待验。

### T642：真实复核旧 open REV-002

旧 canonical cycle 1 round 3 的 REV-002 仍为 open，失败模式是 Project/promotion/reference 已提交后初始 output_script 创建失败，导致缺稿或重复版本。该旧记录没有被本代理改为 PASS，也没有被 foreign snapshot 覆盖。

当前 §2.2、§3.3–3.4、§4.3、§7 与原始 `DEC-RADAR-642`（2026-08-01）共同规定新的事务边界：Project/promotion/candidate 状态/adaptedDraftSeed/reference 原子保存；立项不创建 artifact。用户首开从 seed 得到同一右稿，首次明确保存才走既有正式版本链。该次保存失败必须无半 artifact/version、保留 seed 并允许幂等重试为恰好一份。这个具体产品裁决回应了原半成功缺口，并保留正常选题原流程，不是 T1410 维护授权替用户选择产品行为。

原 REV-001 的必要事实、专有名词、已标注引用例外仍在。原领域宪法 FR-CR-012/013、NFR-CR-008/013 的来源、采纳及相似性要求按现行局部修订适用：2026-08-02 的单编辑器覆盖旧双栏；`DEC-T1017` 仅为新 rewrite_only 主链允许最小真实 evidence、当前定位解析和无策略 Project 写稿，不影响旧 strategy-backed 数据、普通项目、所有权和采纳规则。由此当前规格没有剩余 REV-002 合同缺口；实际 seed 原子事务、首次保存失败及桌面旅程必须另行执行验收。

### T635

核查全体 non-debug 入口（含 local/release-fast/channel）的 creatoros 固定身份、不可通过 env 关闭 runtime 校验、claim=0、Rust/bundle/manifest 同输入、签名后 attestation 与生产迁移盘点。完整读取 Growth `T-123-growth-activity-product-identity.md`，核对 Growth 权益/订单与 Activity 激活权威、CreatorOS 消费边界；无秘钥写入客户端。四类生产/default 数据未归零时不得直接迁移身份，旧 release alias 独立保留；claim=1 须 T575 真实 GO，不能被本地包回执替代。原 cycle 没有 findings，本轮仍完整审核而未继承其 PASS。

## recheck 格式兼容与周期边界

两个 `.recheck.json` 由对应 canonical packet 深复制，所有原 finding 完整保留；只更新 status/resolution_evidence。其 threat_model_id 原本缺省，缺省本身也保留。两个 `.initial.json` 来自本轮当前完整规格重审，保留逐项旧问题销账解释，不是仅改 review_kind，也没有修改旧严重度或安全分类。

| 项目 | 当前 JSON schema | 当前 reviewctl 程序源码 | 正式操作状态 |
| --- | --- | --- | --- |
| T694 legacy recheck | 两个 finding 均缺必填 threat_model_id | REV-001 为 security/blocker，validateFinding 要求非空；补合法 THREAT-REL-001 又改变 FROZEN_FIELDS，recheck 不允许 | 未调用 record；拒绝结论是源码确定性推导，另备完整 initial，待正式授权新周期 |
| T652 legacy recheck | 三个 finding 均缺必填 threat_model_id | validateFinding 对 confirmed-requirement 未做通用必填/string 校验；保持缺省不会单独触发这一项拒绝，补空串反而改变 frozen 字段 | 未调用 record；不能声称 CLI 必拒或已经失败。保留原协议 recheck 与 initial 备用，由主任务依法定适用性确定 |

证据位置：`orchestrator/process/rule-bundle/prompts/spec-reviewer.schema.json` 的 finding.required；`orchestrator/process/reviewctl.mjs` 的 FINDING_FIELDS/FROZEN_FIELDS、validateFinding、validatePacket。历史 audit 对 legacy 事件的有限兼容，不自动证明新 recheck 具备相同豁免。`THREAT-REL-001` 已在威胁模型获批，但本代理没有把它补进冻结旧 finding。reviewctl 的 validatePacket 非公开 export，本轮未改源码或复制引擎执行 record；程序分支结论按源码审查表述。

主会话要求的最小边界为：保留审计历史与缺省字段，不修改引擎、不提高/降低旧安全等级、不用新周期抹去旧问题；确需新周期先精确修订 T1410 并独立审核，再逐项取得既有协议要求的 typed capability。T652 是否必须新周期需区分格式要求与 CLI 实际规则，本说明不预先裁定。

## 本轮验证边界

本轮只检查报告 JSON 格式、SPEC/宪法 SHA-256、recheck 冻结字段一致性和本批 diff 空白错误；不运行产品、provider、签名打包或真机 UI 验收。已另交 T1426 UI 适用性小范围 recheck 与 T1426/T1407 完整适用性研究报告；该适用性裁决不取消 T1407 的真实 UI 验收，也不声称官方 Pi 402 恢复或允许推送。

实际检查结果：7 份 initial 通过当前 Draft 2020-12 JSON schema；2 份 recheck 的全部冻结字段逐项不变，schema 唯一错误分别为 2 个/3 个旧 finding 缺省 threat_model_id。10 份本批交付物通过 UTF-8、结尾换行与尾部空格检查。git diff --check 未报错，但这些新文件被 `.git/info/exclude` 的 `/docs/verification/` 忽略，不能把空 diff 当成已纳入提交；主会话归档时需显式添加。未调用 record 或任何写控制面命令。
