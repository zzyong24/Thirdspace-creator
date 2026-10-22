# T-1394 本机 CreatorOS 启动失败诊断

## 用户请求与范围

用户于2026-10-22反馈本地CreatorOS启动失败，提供 `~/Library/Application Support/cloud.aitongban.creatoros/logs`。本任务读取本机加密日志、相关运行进程、实际启动App及启动代码，定位首个致命错误并核定可逆恢复路径。不清空或迁移用户库，不重置激活，不变更签名/许可制度，不发布或推送。若需产品代码修复，先依据根因补齐本SPEC范围与适用审核。

## 验收

1. 用现有解密工具读取当前故障日志；原密文不变，明文只存本机私有临时目录，不入库。
2. 对齐失败时间、App来源、错误及相关源码，区分根因与后续噪声；未知事实明确标注。
3. 若现有安全可逆操作足以恢复，执行并检查启动/健康状态；否则给出已核实的修复路径，不冒称启动恢复。
4. 诊断结论归档 `docs/research/t1394-local-startup-diagnosis.md`；无产品代码改动时TDD/frontend/contract/e2e/boundary不适用，运行pmem sync及quick只读对账，记录既有失败。

## 文件边界

本轮仅写BACKLOG、任务事件、编译任务包、本SPEC、诊断报告、踩坑记录与pmem生成的PROJECT。真实日志及私钥不进Git。并行代理只读调查并复核结论。

## 实测结果

诊断已闭合，详见 [报告](../research/t1394-local-startup-diagnosis.md)。原库已经0139，启动的工作树旧App仅至0137，系统安装版仅至0138；来源为10/21 T1382开发验证直接升级已装库。当前源码在独立数据库副本上通过只读迁移谱系/物理catalog检查。旧失败进程已正常退出，原库冷快照保全；本轮未构建、安装、执行原库迁移或宣称恢复启动。恢复路径是从当前源码重建匹配App，验副本再安装。

context-plan已核为4-build、固定规则包3.30.0；context-compile因新任务缺task binding退出2，依AGENTS回退读任务行与SPEC，未伪造任务包。pmem sync成功；quick只读对账22ERROR/17WARN，与T1386记录的既有基线相同，范围外旧收据/看板债务未改。无产品源码修改，未运行TDD、frontend、contract或完整e2e/full对账；副本检查不代替新App启动验收。
