# T-881 BUILD 验证记录

## 用户问题

用户在已确认分镜中剔除一个 B-roll 后，页面候选列表虽然变化，“按当前分镜重新生成”仍消费旧
`decisions` / `renderProps`，实际成片继续出现被删素材。

## 根因与修复

1. 原“剔除”只更新前端 `excludedAuto`，没有更新 production 中的当前 editing plan。
2. 新增窄写 operation `outputs.production.editingPlan.broll.remove`：以 `expectedRevision + assetId`
   原子生成新 plan revision，同时清除 decisions、render props、inventory 和失效导演方向中的引用。
3. `excludedAssetIds` 进入正式 plan 契约并在刷新时回读；局部调整任务使用写后读得到的新 decisions。
4. `material.match` 失败回退先按当前 inventory 过滤 base broll，不能复活已排除 ID。
5. 被取代的 render task 与新 plan 解绑并尽力取消；恢复和最终关联均核对当前 `sourceRenderTaskId`，
   晚到的旧任务只能保留历史。props 组装另做当前 inventory 引用完整性门。

## TDD 证据

RED：

- contract：operation 不存在。
- production service：原子删除方法不存在。
- video decisions runner：模型失败时复用旧 base broll，随后审计取消任务。
- production workbench：点击剔除没有发正式写请求。

GREEN：

```text
contract: 2 files, 9 tests passed
backend: 3 files, 119 tests passed
frontend: 3 files, 47 tests passed
contract/backend/frontend typecheck: passed
frontend production persistence integration: passed
Playwright isolated real-browser journey: 1 passed (15.8s)
```

覆盖行为：删除写入与写后读、revision 冲突、失败回退、刷新恢复、当前 inventory 到 render props、
旧 render task 取消与晚到隔离、CLI destructive policy。

## 真实页面旅程

在 Playwright 隔离数据目录创建真实抖音账号、项目、output 和脚本，上传 204KB 的真实 mp4，建立正式
material link 并写入 revision 1 的已确认分镜。Chrome 1536×1024 页面点击“剔除”后：

- 页面显示“已从当前分镜移除并保存”；
- API 回读 revision 2，`excludedAssetIds` 包含该 asset，decisions/render props 的 B-roll 均为空；
- direction 同步失效；
- 切到 1024×720 刷新，候选仍为已剔除，分镜预览不再出现素材名。

命令：

```text
CREATOROS_TEST_PORT=3440 CREATOROS_PLAYWRIGHT_BROWSER_CHANNEL=chrome pnpm --dir frontend exec playwright test tests/e2e/production-broll-remove.spec.ts --project=e2e
```

## 仍需真机回填

当前 CreatorOS CLI 连接不可用，未修改用户项目，也没有把用户私有数据当作测试 fixture。真实浏览器
旅程已闭环页面与 API；包含本修复的本地包安装后，仍建议对原项目执行一次“剔除 → 刷新 → 重新成片”，
回填桌面包中的最终成片抽帧证据。
