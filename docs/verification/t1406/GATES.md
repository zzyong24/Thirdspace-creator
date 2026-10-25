# T-1406 当场修复与验证记录

## 范围与证据

修复依据为新版安装验收 I-01 至 I-08；与旧 `3d741fc9` 的具体问题不同，不能以旧回归记录代替。本轮用户明确要求修复，保留原数据及所有旧未提交任务记录。实施在本地 `codex/fix-installed-eight-defects-20261025`，本轮不向原安装包和原数据库执行测试修改或迁移。

任务包编译实际被缺 task binding 阻断，按 AGENTS 读取 SPEC/BACKLOG fallback；未修改编译守卫。独立子代理实际评审最终 SPEC 后，`reviewctl` 记录首次 `PASS[REV:b3a0d1e8ff5d]`，随后 `taskctl start T-1406` 成功。评审是同模型家族独立代理，未冒称跨模型。完整审查约束见 `SPEC_REVIEW.md`。

本机 codegraph 命令/工具不可用，按规则使用 rg 兜底。测试使用缓存 Node 25.9.0 和仓库依赖，禁止调用会尝试联网下载新版的全局 pnpm；必要子命令用缓存 pnpm 10.32.1。测试运行目录独立，无原库路径或真实模型密钥。

## 已实际发生的验证

- 实施前 boundary：退出0，5条既有违规，无新增。
- 实施前 semantic-boundary：退出0。
- quick read-only reconcile：实际退出1，27错误18警告；与此前基线相同，不计全仓通过。该quick模式明确不执行完整项目lesson命令。
- I-01/I-07/I-08 前端红测4失败54通过、契约红测1失败4通过；I-07后端实际进入正式rubric版本用例并因缺正式投影而失败。I-08链接与锚点另有独立红测。
- A首次限定前端3文件66通过、契约5通过；此时后端被其他并行迁移尚未登记的严格来源闭包阻断，不能记为行为失败或通过，待闭包完成后另验。
- I-02 正式行为红测3条；之前两轮table导入夹具错误单列，不冒充产品红测。0141迁移正式登记后createDb与该3条回归通过；冻结root lineage journal恢复Git原始字节，canonical journal只追加，convergence严格登记新SQL身份与先决链，未关闭守卫。
- I-04 真实adapter对空对象和全空白候选产生ok/proposal的红测已发生；合法非空正例通过。I-03/I-05首轮隔离PGlite在迁移登记半态时被来源闭包阻断，尚未到行为断言，该阻断不计产品红测。

原始命令、完整日志与时间在 `work/creatoros-eight-defects-fix-20261025/`。以上为进行时记录，后续有效结果追加；不同分组可能覆盖同一路径，测试数量不相加冒充独立功能总数。

## 交叉审查与环境核验

- A最终限定回归：frontend 66/66、contract 5/5、backend 21/21；契约类型通过，首次全前端类型检查发现C新增测试类型错误，不记全前端通过。源文件两条依赖数组warning为原有，旧测试any和新增后已清除的any分别记录在 `a-summary.json`。
- C首次扩展backend 301通过、1失败：失败为T1248稀疏克隆缺冻结JSON，尚未到hash断言，不能称代码hash漂移。只读Git远端补取失败后，从既有upstream-reference缓存找到原件，验证Git blob精确 `da4fbcfa68d3859296565676185ce85be9eb7084` 后恢复178736原字节；未生成golden、未改期望值或守卫。完整证明在 `sparse-fixture-restoration.json`。
- 独立审查C真实完成链发现：host空brief错误经现有completion写为partial后，原父任务在CHILD_PARTIAL先阻断，先前手工设succeeded的fixture不代表完整链通过。新增真实completion集成红测已经复现；纯updatedAt变化错误触发新child也有真实红测。此时C独评为FAIL，必须修后实际再核，不以先前局部301通过关闭I-04。
- 契约bootstrap测试出现43项统一 `uv_os_get_passwd ENOMEM`。根代理将同一个只读 `os.userInfo().username` 命令分别在沙箱和获准非沙箱运行：沙箱0.08秒失败、非沙箱0.08秒成功，支持Windows沙箱用户信息权限差异，不能直接写成产品内存不足。未mock系统API或降低测试；需用获准执行环境复跑，记录见 `sandbox-userinfo-probe.json`。
- I-06旧标签增强在预审中发现可能随前端循环一起丢失，已要求恢复基于真实候选建议与冻结组的服务端best-effort标签；不允许借重复采纳或自动重模型修补标签。新事务仍以知识/修订/回执为同一业务提交边界。

## 安装与外部边界

当前仍为源码实施和隔离回归。本地构建、Windows合法签名构建、安装版原生复验、真实供应商请求和外部平台分别记录；未发生的项目不写PASS。未推送、合并、发版或热改现有安装程序。普通构建如需既有Actions签名资源，应先备好可评审提交与测试，再按实际授权处理。

## 最后有效源码结果

- 八项源码修复均完成；A、B、C实现有独立复核，范围见各独立审查。C先前partial完整链及timestamp-only红测已修复，保留原child的partial事实，只对明确可信空brief及成功只读context允许父等待补充；其它partial/未知/错误仍阻断。
- A：前端66/66、契约5/5、后端21/21。
- B：后端41/41、前端28/28、全契约567/567；旧root到0141真实public createDb双启数据保全、原词表组隔离及共享确认已覆盖；迁移五个限定case通过，23个筛选外未运行。
- C：扩大后端367/367，最终受影响74/74；前端最终77/77。真实完成链与旧checkpoint兼容已覆盖。不同批次存在重叠，不能相加。两条未保存的C类型工具输出已从摘要改为如实的tool-only，不造日志；最终类型以根代理实际归档为准。
- 根代理完整frontend typegen/typecheck与backend typecheck退出0；Worker构建退出0；Next生产构建退出0（96.718秒，含完整TypeScript及32静态页），构建保留既有vendor import.meta与NFT tracing警告，不宣称零警告。
- 根代理LED-047八文件192项通过；完整timeout-policy退出0，包含实际公共CLI/Worker/PGlite预算等子检查，不以词法helper代替。
- 最后boundary无新增违规（5=原基线5），新增测试跨模块repository引用已移至integration层，未改守卫。semantic-boundary通过。pmem sync实际成功且codegraph跳过；quick read-only reconcile最后仍27错误18警告，与基线相同，不标完整全仓全绿，也未重跑全部旧104 CI失败项。

现已准备本地可评审修复内容。远端修复分支、候选构建和原安装升级如继续发生，必须追加实际结果；当前本节不替后续流程预填PASS。

最后代码检查发现并修正了蒸馏卡effect同步reset和新增测试any：以稳定source+组epoch key重挂载会话状态，effect仅同步外部回执，保留即时取消及迟到响应防护。最终28组件复跑通过；19个改动前端文件以Git基线逐条对照，新增lint错误0、警告0，原有18条错误未冒称清零。该产品修订后完整Next生产构建重新通过（92.87秒，含TypeScript），最终backend类型检查54.964秒退出0，前一轮构建不代替此终态。
