# T1331 本地实现与公共链结果

本地目标修复及兼容回归已通过独审；最终新包尚未执行，不写整体完成。原 SPEC c45bec…、兼容补充 c0770b4a80d40c1ad59c373d1d2f1c50efc0d72741dce34501a151dfccb71dbd、原目标 RED、首轮 GREEN、所有装配 FAIL 均保留。

实现由 artifacts 属主在原事务标记新预留空 v1；正式保存/采纳/restore 在原 CAS 事务解除。历史 NULL/公开空 v1 不回填。私有指针不外露，只投影可选只读布尔。确认稿 reader 共用一次精确 artifact/current snapshot，完整投影后重验 current；canonical 原五字段/正文/hash 保持，review 在同版保原 transcript-string（含显式空）优先、否则 contentText 的原字节与 trim 判空规则。错误不冒空/无稿；仅 null 回 seed。persistence 薄注入由 C 完成，未改旧版本或 exporter/T1034。

## 当场结果与原件

| 验证 | 实际结果 | 原件（相对本目录） |
|---|---|---|
| 初始预留目标完整公共 RED | exit1，31.479s；真实父/child/候选/采纳，三个 server consumer 预采纳错误 | runtime/run-red、runtime/cases/red |
| 首轮公共 GREEN | exit0，25.471s；不代后发现的导出兼容缺陷 | runtime/run-green、runtime/cases/green |
| 原导出三族公共 RED | exit1，19.767s，1it/6soft 失败；三真实 GET200/ZIP | runtime/regression/closing/export-public/{run-red-v1,cases/red-v1} |
| 双投影与原 T1034 | exit0，158.023s，39/39：reader9、原 review7、原 artifacts service23；T1034 一字不改 | runtime/regression/closing/export-green/run-green-unit |
| 导出同链 GREEN | exit0，21.810s，1it；三 ZIP 口播稿、review、期望逐字相等 | runtime/regression/closing/export-green/{run-green-v2,cases/green-v2} |
| 完整主链双投影 GREEN | exit0，28.301s，1it；新父44/child48、原稿/候选/采纳/刷新/非最高 restore/三类空稿/错误读侧 | runtime/regression/closing/main-green-v2/{run-green-v4,cases/green-v4} |
| 核心原读侧与目标边界 | 43/43，81.728s；未变消费者/目标门精确继承，不重复计数 | runtime/regression/core-v1 |
| 后台转录、seed/outline、历史协议审计 | 3PASS，21.714s；其余过滤 skip | runtime/regression/source-machines-v2 |
| 状态失败/取消与公开只读字段 | 2PASS，16.119s；状态例明确无 worker/模型 | runtime/regression/closing/final-boundaries |
| 原 artifact 大回归 | 54PASS/1FAIL，178.700s；唯一 T1034 FAIL 已由上述原样23例覆盖修复，不改旧结果 | runtime/regression/artifacts-contract-v2 |
| 迁移 PGlite | 24PASS/4PG skip，146.379s | runtime/regression/migrations-v1 |
| 新 owned PG | 必要 fresh+4PG=5PASS，139.129s；fresh 不重复计数，合计 PGlite24+PG4；其余23只是过滤 skip | runtime/regression/postgres-v1 |
| backend 类型 | exit0，79.521s；两窄修 test SHA/afterSourceDrift[] | runtime/regression/closing/type-narrow/BACKEND_TYPECHECK.json |

单测使用 createDb 的 PGlite；generic unit wrapper 的派生 dataDir 不是其实际磁盘库证明。PG 使用已有本机二进制和新 nonce/root/随机端口、实际进程身份核验与清理，无安装/无连接用户库。旧 lineage/SQL 原字节不改，新迁移只增 0138/idx111；Root 已独核原111前缀与 SQL/hash。

## 精确消费者与版本

完整独立正文、ref/current 与平台上下文见 `runtime/green-control/closing/FINAL_CONSUMER_EVIDENCE.json`，原快照路径一并保存。

| 时点 | 实际 artifact / current / 版本号 | 各用途结果 |
|---|---|---|
| before、before-candidate、awaiting | master16 / v18 / version2 | review 原纯文；daily/平台 canonical 含原章节标题；同一稿同一版本 |
| 采纳、刷新、restore 非最高 | target46 / v51 / version2 | review 为该版原 Markdown；daily/平台为 canonical 段落；身份/版本一致，字符串不强求相等 |
| restore 初始空 | target46 / v47 / version1 | review/daily/平台均正式空，seed0 |
| 明确清空 | target46 / v60 / version4 | 正式空，不回母稿/seed |
| 普通公开空 v1 | artifact76 / v77 / version1 | 无预留、仍正式空 |

上述 ID 后缀均属本次 `8e151b67`。旧 master 与另一平台 document 完整不变。损坏 current：真实 review/ref/UI 拒绝；公开日报 script=null+warning；seed0。原 publication 仅由透明合成来源端口提供，不落“已发布”事实，不称真实发布/采集。

三真实 ZIP GREEN：plain 1091B/SHA bf35493aaa76df60dc29b92f2863f88f838ce08f231f2b48a50b8ecf9aa96d10；literal 1105B/7721d1940403ae856abfe963ecf020a8c5930cb82ae48f97dc387b1dc21d2ec0；restore 1073B/c47418bbd4fbcf80c205ec393b300c851bd091ccd6f7bfd54fff23c5496cdcd1。旧 RED 三 ZIP/正文未覆盖。

## SPEC 输入族映射与边界

| 输入族 | 实际证据 / 可继承范围 |
|---|---|
| 非空旧 master + 新预留目标、候选未采纳 | 新主链三个 server/UI/article/graphic 实际读取；采纳前仍 master16/v18 |
| 公开空 v1、显式清空、restore 当前初始空/非最高旧版 | 主链9时点 + reader9 + 原目标4；不取最高版本、不回灌 |
| 旧 NULL/旧空稿、既有非空初版、不回填 | core-v1 的 truth/reader/目标边界 + PGlite/PG迁移；不是历史推断修复 |
| 同任务/不同任务复用、项目与两个 output 独立、组归属门 | 原 T1327 service-v2 19PASS 与 core-v1 目标4；原公开链门已审，不改旧 FAIL |
| 正式保存/AI采纳、原事务回滚、CAS冲突/并发赢家、旧receipt只读 | core-v1 目标4（包含真实保存/采纳服务）；原 public confirm 主链闭合 |
| 候选生成不确认、失败/取消不确认 | 新主链 awaiting 标记保留；final-boundaries 真实业务状态例（无 durable worker失败声称） |
| 模型设置变化不等于确认 | 私有字段写入点/事务盘点，设置服务无该写口；本任务未另切配置，不冒一次新配置验收；T1325旧真实未配置采纳仅保其自身范围 |
| 内部 replaceStructuredContent | 目标4实际材料化不解除；没有新增公开 op 或“用户同版本保存”功能 |
| 转录/机器来源、预留并存 | source-machines-v2 真 TranscriptArtifactService ensure/restore/重复：不接管预留、不改旧母稿；其它机器可达性为 SPEC 源盘点，不冒全族执行 |
| JSON段落、结构表顺序、transcript、纯文、hash | reader9/core 原提取 + 公共主链；两个用途保持同 snapshot，各自协议 |
| 显式空 transcript + 非空 contentText、空白规则 | reader9 的实际 DB/真实 review consumer，seed0；三 ZIP 覆盖旧 exporter |
| 没确认稿才 seed/outline、权限/损坏/并发不冒空 | source-machines-v2、project-script-source9、reader9、主链 actual-error-consumers |
| 跨账号/项目/output、组/归档/成员变化、假标记/私有字段/旧DTO | 目标4、原 T1327 service-v2、原 artifact repo/service/transport passed项与 final-boundaries 公开合同例；不降低原门 |
| exact history 与旧 frozen digest | source-history-audit 原观察/真实 work-source restore；旧 readVersion 不变。仅结构表来源的 workCreation 既有空链欠账已独立登记 T1333，**不给该输入族 PASS** |

完整主链为真实宿主/账本/不可变3851 worker+合成 Codex I/O，modelTurns=3、外部付费模型0；不代新包/真实供应商协议。主链5项 cleanup 完成、8登记PID实际 null、remaining PGID[]、afterInputDrift[]。ZIP账本 ai/execution/calls 均空且清理完；不能把 hostPortInvocations 当 fork 数。

原装配失败均保留：source/artifact v1 导入缺1328 policy；export-observer v1 alias；ZIP green-v1 锁纳无关B test预检（未进it/DB）；main green-v3 有真实父44启动、worker旧根 guard拒绝而 failed、无业务child/模型。新v4仅复制3helper、entry精确本 cases/green-v4 根，其它helper原样及worker3851保持。不补拍旧结果、不续旧deadline/重发旧任务。

## 收尾与待办

1328 前端独立结果在 `docs/verification/t1328/frontend/FRONTEND_RESULT.md`：15PASS、frontend tsc0/70.160s，最终f750…；LED-047八组174PASS/0FAIL、23.879s、afterInputDrift[]（旧localTab性能不重跑）。Root 已接受上述局部边界与本次两公共 GREEN。

R 产品写入结束；统一 boundary/orphan/semantic/timeout、pmem/reconcile、最终不可变包与真实新root/供应商/页面操作由 C/Root 统一收尾，当前仍待执行/汇总，不标全绿或 complete。最终 U18 正式 script.review 的非最高v2冻结/报告刷新另有 NOT_RUN 准备目录，不混入本地已发生证据。
