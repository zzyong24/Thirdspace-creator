# GATE T-614 — BUILD

## 结论

PASS。热点宝二维码授权链正常，黑马同步失败的真实断点是官方榜单页搜索框结构漂移：

- 当前输入框占位文案为“大家都在搜：助眠”，不再包含旧选择器依赖的“关键词”或“搜索”；
- 当前 `<input>` 没有显式 `type="text"`，旧后备选择器同样无法命中；
- `fillKeyword` 等待 15 秒后抛出搜索框不可用，运行记录安全投影成
  `RESPONSE_SHAPE_CHANGED`，所以表现为“已登录但无法同步”；
- 现已优先识别“大家都在搜”，并增加通用“搜”及 Arco 搜索框结构后备；
- 搜索框再次漂移时使用独立 `DouhotSearchInputUnavailableError`，仍安全归类为
  `RESPONSE_SHAPE_CHANGED`，不泄露 URL、Cookie、关键词或页面正文。

## 真实证据

本机持久化运行记录：

- “黑马：川菜”曾成功读取 `code/data/objs`、72 小时窗口、30 条官方候选；
- “黑马：粤菜”和“黑马：Agent”失败运行均为
  `RESPONSE_SHAPE_CHANGED`，安全错误名为 `DouhotResponseShapeChangedError`；
- 同一账号同时存在成功与失败，排除“热点宝始终未授权”。

修复前，使用同一热点宝登录态和“粤菜”关键词真实执行：

```json
{"ok":false,"name":"DouhotResponseShapeChangedError","message":"热点宝关键词输入框不可用"}
```

随后读取当前官方页面 DOM，确认搜索框：

```json
{"tag":"input","placeholder":"大家都在搜：助眠","class":"arco-input arco-input-size-default"}
```

修复后以同一账号、同一关键词再次真实执行：

```json
{"ok":true,"listValid":true,"count":28,"window":"72","responseShape":"code/data/objs"}
```

## TDD 证据

红测：

- `douhot-cdp.test.ts` 新增仅让 `input[placeholder*="搜"]` 可见的当前页面夹具，初次运行抛
  `DouhotResponseShapeChangedError: 热点宝关键词输入框不可用`；
- `source-sync-runner.test.ts` 新增 `DouhotSearchInputUnavailableError` 安全分类，初次运行错误地
  得到 `NO_VALID_RESPONSE`。

绿测：

- 前端相关 6 files / 102 tests PASS；
- 后端来源运行器 1 file / 13 tests PASS；
- 覆盖当前搜索框命中、官方响应解析、授权探针、账号上下文和错误安全分类。

## 静态与边界证据

- frontend `pnpm typecheck` PASS；
- backend `pnpm --filter @creatoros/backend typecheck` PASS；
- `node orchestrator/process/boundary-scan.mjs --quiet` PASS；
- `git diff --check` PASS。

## 飞书

记录 `rec27SRhhdce4u` 已更正：明确撤回“未发起授权”判断，写入搜索框漂移根因、真实 72 小时
榜单 28 条证据及发布状态。源码已完成但尚未打包发布，解决进度保持“处理中”。
