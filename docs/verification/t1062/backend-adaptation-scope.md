# T-1062 后端适配精确写集（只读建议）

已生成 `/tmp/t1062-backend-adaptation-write-set.json`，绑定当前整合 HEAD `f8ce322d63e1844e6eff8595af85813e50d7d79d`。共 120 条必改或必要新路径（其中 6 个必要新文件）、23 条条件路径、50 条只读依赖；无 glob，无产品/控制编辑或提交。迁移整合后的 before SHA 已当场重采，租约前仍应再核 HEAD/路径摘要。

- 0128 是已通过的上游依赖，本波不新增重复 SQL、不写 journal/lineage。8 个 ORM schema、26 张表、11 个纯组 partial unique 必须逐项与实际 DDL 一致；历史账号唯一键保留，同组两账号撞请求号不得任取首行。
- 必改覆盖画布、私有模板、创作结果/转换、组合/素材、制作编辑/媒体/ASR、制作精确文件绑定、工作审核、legacy asset 恢复、canvas tool host、粗剪 v3 正式合同/Skill/采用恢复、CLI group 幂等；各域真实 tests 单独列。已有 getProject(forUpdate)、workspace scope map、原 execution 权限/锁/费用端口均复用，不默认重写。
- protocol2 原冻结字节/摘要不可因新增 group 字段重签；v3 仅显式新入口新摘要。新任务持久冻结 scope，恢复与结算不借页面当前组或成员身份重新盖章。
- 105 诊断的 22 原 tests 与合同 4 个真实失败全部列入；asset 五个红例有真实生产缺口，保留原红脚本/日志/结果；cover atomic 已有生产链，补公共 gateway 专项变体，不放宽任意工具。
- CLI 源已有 `--group`、组头和 task read/wait；现装 `creatoros --help` 当场 exit0，仍旧账号帮助，Skill 文档旧。真实生产问题是 `accountScope=account??__user__` 跨纯组缓存，不能只改文案。按正式 operation scope 分组 namespace：同组创作跨平台共收据，不同组隔离，真实平台目标另核；旧 account 回执不改，gateway 公共测试必须实测。

JSON 内含逐路径用途/前摘要、域矩阵、0128 精确语句与 partial index、源红绿证据 SHA，以及 22 组可执行 argv 验证组合。真实 PG 并发仅允许已有 `127.0.0.1:55422` 隔离 harness，跳过只能 pending；没有在本审计运行产品测试或读取真实数据库。真正 frontend 组切换/音频播放确认/四 native source-copy 与构建留下一串行 wave，只列精确 server 装配和 gateway 测试例外。

## 公开根依赖修订（2026-10-05）

暂停中的20个WIP文件完整保留，原lease已释放。实际调用显示外围转换/组合依赖projects、article、graphic-post、moments及原模型lease根仍按账号隔离；独立一次性审查19条精确路径后纳入其中18条新路径，当前step共162条（138条必要/新、23条条件、1结果）。报告19/19原文件摘要与base75131f一致；第一轮1条人工摘要遗漏原样保留，第二轮程序重采纠正。仅scope足够，不是实现或测试通过。

content_outputs.group_id仅从同事务锁定的project派生，project仍为唯一授权父真相；旧账号回执、摘要与冻结费用保持，新纯组键使用真实group/account NULL，历史多账号同key不得任取。article/graphic读取时的不可变候选投影和归档历史读取须兼容，当前采纳/新创作仍按写权限；moments原lease settle不得以eq(NULL)静默零命中。0128/原SQL/journal不改。新增第23组验证覆盖这些真实公开根与lease；后续前端/原生仍未动。


## durable转写回执结构比较修订（2026-10-05）

当前正式step为174条（150条必要/新、23条条件、1条结果），原27组验证保持。首段及162条记录是历史提案/修订，不能当当前范围或通过证据。最新精确路径以JSON和modules.config.json为准。

真实公共持久链转写回归11项中7失败/4通过：原ASR账本已结算，数据库JSONB键顺序与现有严格result schema解析对象顺序不同，saveArtifact误拒合法原文。日志原字节保留；ASR边界使用adapter fixture，本次红不是新真实模型推理。唯一新增生产路径为execution-transcribe-workflow.service.ts；在既有回执优先分支之后、ensure之前严格校验两侧现有schema，再按全部值/类型比较。对象键顺序不作身份，正文/reason/applied/额外字段和非法类型仍拒绝；不改变父权限、取消、租约、费用或DDL。

独立scope审查及101条WIP暂停摘要见preflight/transcribe-workflow-structural-receipt-scope-review.json与transcribe-workflow-paused-wip.json。ROOT核101/101当前摘要后以自有stash保护，释放旧lease后再修订。此记录不是产品实现、整套测试、安装或任务完成PASS。


## 原重建结算与可空账号父锁修订（2026-10-05）

当前正式step为178条（154条必要/新、23条条件、1条结果），只读依赖48条、必要新文件6个及原27组验证不变。完整重建测试已属于既有“公共cover atomic与新领域组合”，不得只交专项绿色。新增4个精确源为artifacts.service、reconstructed-artifact.service、reconstruct-completion.service及project-lock.service；第4源仅修改lockImportedProjectForReconstruction。artifacts.repository已经在scope内。

原模型账本已settled/providerResult/15tokens、业务结果尚空，原账号组归档后ArtSvc206拒绝物化，真实红2原字节保留。红1在claim前缺平台fixture，明确不是功能红。红2直接调用ledger.reserve，尚未证明真实generation model/N请求协议；后续必须从actual structured prepare及generation端口建立原调用、经过同一completion收口，不更改旧日志冒充完整PASS。

仅对真实同事务原ref/fence、task↔business↔Skill冻结身份/版本、model/N已知usage、同user原group及imported父项目建立受限命名结算证明。普通新建/追加归档门不变，不按source/type/布尔值豁免；父搬组、成员转组、foreign/cancel/expired/未决调用等拒绝保留。可空account是共享任务真实入口，父按user/group锁，不造账号。锁序须按真实PG两顺序验证，不把PGlite当并发证据；如果需新增通用helper/lease路径，先报精确阻塞。

独立scope报告及102条暂停WIP摘要见preflight/reconstruct-settlement-root-scope-review.json与reconstruct-settlement-paused-wip.json。ROOT当场核102/102字节并以自有stash保护后释放lease。这次只准入最小修复范围，不是实现、完整验证、真实模型或安装验收PASS。
