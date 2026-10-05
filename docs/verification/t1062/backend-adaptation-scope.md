# T-1062 后端适配精确写集（只读建议）

已生成 `/tmp/t1062-backend-adaptation-write-set.json`，绑定当前整合 HEAD `f8ce322d63e1844e6eff8595af85813e50d7d79d`。共 120 条必改或必要新路径（其中 6 个必要新文件）、23 条条件路径、50 条只读依赖；无 glob，无产品/控制编辑或提交。迁移整合后的 before SHA 已当场重采，租约前仍应再核 HEAD/路径摘要。

- 0128 是已通过的上游依赖，本波不新增重复 SQL、不写 journal/lineage。8 个 ORM schema、26 张表、11 个纯组 partial unique 必须逐项与实际 DDL 一致；历史账号唯一键保留，同组两账号撞请求号不得任取首行。
- 必改覆盖画布、私有模板、创作结果/转换、组合/素材、制作编辑/媒体/ASR、制作精确文件绑定、工作审核、legacy asset 恢复、canvas tool host、粗剪 v3 正式合同/Skill/采用恢复、CLI group 幂等；各域真实 tests 单独列。已有 getProject(forUpdate)、workspace scope map、原 execution 权限/锁/费用端口均复用，不默认重写。
- protocol2 原冻结字节/摘要不可因新增 group 字段重签；v3 仅显式新入口新摘要。新任务持久冻结 scope，恢复与结算不借页面当前组或成员身份重新盖章。
- 105 诊断的 22 原 tests 与合同 4 个真实失败全部列入；asset 五个红例有真实生产缺口，保留原红脚本/日志/结果；cover atomic 已有生产链，补公共 gateway 专项变体，不放宽任意工具。
- CLI 源已有 `--group`、组头和 task read/wait；现装 `creatoros --help` 当场 exit0，仍旧账号帮助，Skill 文档旧。真实生产问题是 `accountScope=account??__user__` 跨纯组缓存，不能只改文案。按正式 operation scope 分组 namespace：同组创作跨平台共收据，不同组隔离，真实平台目标另核；旧 account 回执不改，gateway 公共测试必须实测。

JSON 内含逐路径用途/前摘要、域矩阵、0128 精确语句与 partial index、源红绿证据 SHA，以及 22 组可执行 argv 验证组合。真实 PG 并发仅允许已有 `127.0.0.1:55422` 隔离 harness，跳过只能 pending；没有在本审计运行产品测试或读取真实数据库。真正 frontend 组切换/音频播放确认/四 native source-copy 与构建留下一串行 wave，只列精确 server 装配和 gateway 测试例外。
