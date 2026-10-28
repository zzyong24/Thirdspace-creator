# T-1433 实施与验证

## 结论

重复发布同步不再制造项目版本变化。markPublished 在现有工作区父锁内读取项目及阶段、计算变化并同事务提交；阶段/项目已经是目标状态时返回原行。normalizeVisiblePlatformWork 在原父链锁内重读发布及当前父项目，只修改实际改变的行；缺省 hidden 保持缺省，仅明确 true 才变为 false。真实资料合并、阶段变化和隐藏转公开仍更新时间。

本次仅改两份产品源码与两份测试，未改公开 contract、迁移、模型配置、签名密钥、业务数据或安装包。独立实现审查已由独审会话直接保存于 implementation-review.json，未发现需修复问题；SHA256为 c8fb59c33b13db83da92e3efe8c0fcf2bd842068fa832bff185a55181f29cd47。

## 当场验证

| 检查 | 实际结果 | 原始日志 |
| --- | --- | --- |
| 原实现新增9项红测 | 8失败、1通过、76因筛选跳过，exit1 | red.log |
| 首次修复相同9项 | 9通过、76因筛选跳过，exit0 | green-targeted.log |
| 最终5整文件（含另加2项事务回滚） | 151通过，0失败，155.72秒，exit0 | green-related.log |
| backend完整类型检查 | exit0 | backend-typecheck.log |
| 原timeout-policy完整入口 | exit0 | timeout-policy.log |
| boundary | exit0；既有5条，无新增 | boundary.log |
| 四个改动源文件diff --check | exit0 | commands.json记录命令 |

全部 Vitest 命令 retry=0，testTimeout/hookTimeout=120000，相关五文件 maxWorkers=1。Node v25.9.0、pnpm 10.32.1。完整命令与退出码在 commands.json；精确四文件 SHA-256 在 source-hashes.json。第一次绿测发生于两个补充回滚测试加入之前，不能把后加用例冒充原红测。不同批次有重复覆盖，数量不累计为不同测试总数。

## 覆盖

- 推进时钟：首次发布变化、第二次同值不变、实际阶段变化继续更新。
- 同值资料合并不改版本；实际简介变化更新并保留 manual 来源。
- 并发重复调用不制造版本；跨用户/账号拒绝；归档只读。
- 公开状态首次归一、重复归一、再次隐藏后的真实恢复。
- hidden缺省和false均保留原始字段，无凭空补写false。
- 只修改发生变化的项目/发布行；不匹配外部作品引用不得改项目。
- 真实 SQL trigger 抛错：项目写失败，阶段变化/发布变化分别与项目一起回滚。
- 旧 ingestion 重复合并、准备幂等与真实 Brief 终态链所有已有断言继续运行。

## 保留边界

这是源码与隔离内存 PGlite 验证，没有调用模型/平台服务，没有运行用户业务库。旧 Windows poststart 两条原项目 updatedAt 差异仍原因未定；不能把此次可重现路径追认为历史现场根因，也不能把原严格快照 FAIL 改为 PASS。没有新包或Windows真机复跑，不代签安装版完成。

原始日志提交为同名 .log.gz，解压后与本文及独审所引用的 .log 逐字节相同；映射和SHA见 ../t1432/raw-evidence-packaging.json。
