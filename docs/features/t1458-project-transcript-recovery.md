# T-1458 本机项目转写恢复与正式交付

2026-11-10 用户反馈“和常规智能体有何不同？五分钟讲透GrokBot…”雷达来源项目无法提取文案，转写等待抖音登录，同时要求核对 codex/binding-radar-formal-release 是否全部合并并重新打包。沿用月明水清深账号组、源码修复、双平台正式包和本机安装授权。

先通过安装版公开CLI核实原项目、来源、原转写任务及真实抖音账号，保留已有任务ID和已保存内容，不以重复提交或改写任务状态掩盖问题。读取源码和脱敏工程日志属于本次修复范围；业务数据只走公开CLI，不读取数据库、登录档案或凭据，不新增平台截图。

范围：首阶段只读核实并记录 docs/verification/t1458/**、本SPEC、BACKLOG与现有任务控制面；依据实证补充最小实现路径、适用评审和测试，再动产品代码。用户指定分支已提交的新代码在独立干净候选中核查集成，不触碰他人工作树未提交内容。保持公共契约与数据归属，发现需变更时先明确SPEC。

验收：新缺陷先红后绿，覆盖原项目公共调用链、登录恢复和原任务续接，按实际修改跑类型/边界/超时与前端门；真实来源转写正文保存回读。冻结后按官方打包技能预检、非强推集成，only=all与validate_installers=true触发同一正式run；核实签名公证/Windows安装启动卸载、安装包SHA、本机替换及原任务回读。不创建tag或Release，不修改生产配置。无法完成的现场结果明确保留，不以源码测试代替。

## 已证根因与最小修复

公开回读req-2d51393f-35755确认抖音acct-5d5290e4-4345 loggedIn/sourceReady均true；原子任务execution-task-7aa61434-53342属grp-5d5290e4-4284、accountId=NULL，仍LOGIN_REQUIRED。原item intelligence-item-2578f847-7129保留真实来源账号。intelligence-transcript-bridge把纯组ctx直接交readSource，装配的douyinAuthDirFor(NULL)因此取临时_default档案，而非已绑定账号。不是仅凭重新打包就能解决。

仅修改backend/src/modules/intelligence/intelligence-transcript-bridge.ts及新增同目录集成测试：来源读取前沿当前租约重验原item绑定；纯组任务且item有真实来源账号时，复用lockWorkspaceMembership核实原账号仍属同组/同用户、active，并核对平台douyin。仅该次来源读取使用来源账号上下文；模型额度、原任务、groupId、ID、调用账本、保存工作区及既有匿名读取不改。显式账号旧成功保留；来源账号缺失保持原匿名兼容，禁止猜测首个账号或当前页面默认值；跨组/他人/归档/错误平台拒绝凭据使用。不得新增deadline、retry或改变未知付费回执行为。

新增RED→GREEN测试走公开enqueue endpoint→持久原任务领取→真实情报Worker IPC→受控来源读取→逐字稿/任务公开回读；至少覆盖纯组来源账号（包括两个抖音账号时仍取原item）、显式账号旧成功、无来源账号匿名兼容、跨组/他人/归档/错误平台拒绝、取消/绑定改变和原任务恢复。受控图文/音频fixture不称平台真机。实际视频来源原任务须安装后公开续接并回读非空逐字稿，不能拿图文skip当视频成功。
