# T-1112 独立 SPEC 初审

- 结论：**CHANGES_REQUIRED**
- SPEC SHA-256：`0a3bf07dc3c798ba5e10609e5e984a667e918db88fbf9774a6ea367046354156`
- Constitution SHA-256：`86bc2c8add6a01ebf5b2ecf9de05d448770ca14a4e0bdbbf376fffc6387e3800`
- modules.config SHA-256：`374bee6c735dfcbc517dfb73db832c083987ff094427ed3260561e246b2bfe3a`

## 范围判断

该缺口属于既有用户确认范围。能力目录只是读取安装包实际装配能力，不执行模型、任务、文件或平台动作；纯组共享创作不应被迫伪造平台账号。将唯一 `workbench.capabilities.list` 声明为 group，并只让该 transport 分支接受明确 groupId 或旧 accountId，是最小修复。其余七项继续 platform-account，响应 schema、操作ID、数据、网络和权限系统都不变化。

实际安装证据可信：源码 `87964675…` 的18项公共读取为17 PASS/1 FAIL，唯一失败是该操作HTTP 428；日志 SHA `ffeb483750a73289e64125108af6c08f1aa68e4aa2f1496d2db915a8def22465`，单项响应 SHA `488afd0fce3939a901927d7fd2239bd5cd6b16ab8b44a68dd4f39b6254140b1f`。这不是安装修复PASS。

SPEC已要求真实PGlite、CLI invocation service、正式transport和原schema组合，并覆盖真实空组/旧账号、不同user/错误组、无认证/无工作区、七项继续拒绝和零写入；这些边界足以避免helper或mock代签。

## REV-001：模块没有验证命令

T-1112模块有精确写集，但没有 `verify_commands`。因此任务包不能强制执行SPEC列出的公共组合、原CLI gateway/dispatch、workbench回归、类型、三门卫和120秒预算。实施前必须补精确implementation命令。

## REV-002：归档组规则缺真实组合验收

SPEC第13行明确要求归档读规则保持。scope从platform-account切到group后，CLI会进入group读取的归档分支；但第26行用例清单没有归档组。应在同一新增integration文件增加：真实归档组的已认证成员可读目录、错误用户或非成员仍拒绝、且零业务写。无需新增产品路径或开放其它七项。

本报告不代签实现、完整reconcile、安装复验或全局绿色。
