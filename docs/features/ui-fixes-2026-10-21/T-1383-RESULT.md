# 内容雷达布局调整交付

代码与定向测试完成；真实浏览器视觉验证及Git提交受环境权限阻断。未推送，未修改授权、激活、verdict或签名代码。

## 布局

来源栏由共享样式强制180px改为页面统一管理的300px；来源名/类型状态、账号说明、操作分行，长名称完整换行，按钮间距8px并可换行。作品与详情余量按0.9/1.1分配，常规桌面作品单列，作品区达到640px才排双列。实际可用宽度小于1040px时详情下移，小于680px时纵向堆叠；至少1320px时恢复可调详情宽度。

```mermaid
flowchart LR
 A[来源300px
名称完整、操作独立] --> B[作品至少300px
常规单列卡片] --> C[详情至少360px
03阅读 → 04唯一升级入口]
```

保留RadarCollectionGroup图标、说明、真实计数与空态，保留未知转写“状态未知”。原业务回调、采集权限与升级逻辑未改。

## 修改文件

- `frontend/src/features/intelligence/intelligence-workbench.tsx`：布局挂接、来源行排版和操作分组、详情可键盘聚焦。
- `frontend/src/features/intelligence/intelligence-workbench.module.css`：新增局部三栏/两栏/单栏、容器查询、卡片网格与来源操作样式。
- `frontend/src/styles/creatoros-studio.css`、`creatoros-polish.css`：移除冲突的雷达专属旧布局覆盖；其它页面规则保留。
- `frontend/src/features/intelligence/intelligence-workbench.test.tsx`、`intelligence-layout.test.ts`：更新交互/结构测试，新增4个样式契约测试。
- `design-system/creatoros/pages/libraries.md`：记录此次已授权布局规范。
- `BACKLOG.md`、`PROJECT.md`、`orchestrator/events.ndjson`、本项SPEC与本结果：任务、自动同步和实际验证记录。

## 验证与限制

frontend雷达测试9文件95用例通过，typecheck通过；boundary-scan无新增（基线5），diff检查通过，pmem同步完成。完整日志及基线在 `/private/tmp/creatoros-radar-layout-2026-10-21/`。

未执行真实浏览器验收：Computer Use未获准使用Chrome。未执行完整reconcile：T-1373真实CLI副作用尚未隔离。未运行全仓测试、未更改已知T-767/contract路由/lint欠债。不能把本次定向通过视为全局全绿。

Git写入被沙箱拒绝：index.lock / Operation not permitted。按用户授权留下 `radar-layout.patch`、`commit-local.sh` 与 `files.json`；脚本仅在原分支/原HEAD、暂存区为空、文件摘要匹配时暂存本项文件并创建中文提交，不推送；`--check`只核对工作树与补丁，不写Git。若文件有后续编辑会停止，避免混入其它工作。
