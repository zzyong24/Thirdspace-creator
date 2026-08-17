# T-862 BUILD 验证记录

日期：2026-08-16（America/Los_Angeles）

## 目标与根因

T-861 加密日志证明：作品明细 60 条已成功落库，但 10 条缺封面作品全部在匿名 `iesdouyin` 分享页的 `_ROUTER_DATA/item_list` 解析阶段失败，封面回填为 0/10。逐字稿链已有按当前账号登录态回落 detail 的能力，封面链仍直接调用匿名入口。

## 实现

- 在 `douyin-cdp` 新增封面专用组合入口 `fetchDouyinCoverUrl`。
- 默认仍先走快速匿名分享页；只有 `parseDouyinVideoUrl` 的确定性解析失败才回落登录态 detail。
- 回落使用本次 `RequestContext.accountId` 对应的独立 `authDir`，不依赖桌面默认账号。
- detail 返回真实 `coverUrl` 后，继续复用既有封面下载、image asset、publication revision 与项目 material link 链路。
- 网络、HTTP 与冷却错误原样交给现有限流/退避机制，不盲目切第二通道。
- detail 判为图集或没有封面时返回空，由回填层诚实计为 skipped；已有封面仍不进入候选集。
- 回落日志使用 `[douyin-cover-backfill]`，不再被误记成逐字稿调用。

## TDD 证据

RED：新增 3 条 T-862 测试后，聚焦测试以 `fetchDouyinCoverUrl is not a function` 失败；119 条既有测试通过，证明失败只来自缺失的新能力。

GREEN：

- `douyin-cdp.test.ts`
- `douyin-cover-backfill.test.ts`
- `douyin-heavy-backfill.test.ts`

共 3 个文件、143/143 测试通过，覆盖：解析失败回落、账号 `authDir` 透传、detail 封面返回、HTTP 不回落、图集跳过、下载/落库/项目绑定、已有封面幂等、冷却提前结束与单作品失败降级。

## 其他门卫

- frontend 类型检查通过（含 Next.js route type generation）。
- `git diff --check` 通过。
- `boundary-scan` 无新增物理架构违规（存量 5 条保持基线）。
- `semantic-boundary-scan` 通过。

## 真实运行边界

本轮遵守用户数据边界，没有重新触发当前账号采集、没有直接访问数据库，也没有修改任何作品或素材。当前已安装的 CreatorOS 1.1.0 runtime 仍是旧代码；该修复需要进入后续更新包后，用户再正常刷新作品数据，缺失封面才会按幂等规则补齐。由于 CLI 完整访问未开启，本轮不伪造安装版真机回填成功。
