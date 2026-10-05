# T-1055 设置 / 聊天 / 脚本顶条隔离实施证据

源快照：`/tmp/t1055-settings`。仅改授权的 13 个前端文件；根工作树未写。

## 改动
- 原 `creatoros:assistant-engine:v1` 真偏好与广播保留；新增无 UI 订阅 hook 同步真实账号和 `/api/chat/engines` 状态。CreatorOS 默认不探测本地 Codex。
- 编导引擎选择、实际状态与重新检查放设置「模型配置」页顶部；重查广播让已开聊天同时重新读取。支持 `/settings?highlight=assistant-engine` 定位。
- 聊天保持同一 liveSession/transport，新消息取新设置，已发送消息通过原 sourceEngines 固定重试引擎，在途流不停止。Codex 不可用时输入/附件保留并显示设置入口；附件不支持的原提示改指设置。
- 删除脚本「项目作品与创作」，普通稿无空顶条；真实导入徽标、逐字稿任务、发布复盘按原状态保留。旧 ?view=works 路由无改动。

## 当场证据
- `engine-layout-red.log`：原代码 7 fail / 119 pass。6 个产品断言真实失败（选择 UI、默认多余检测、设置链接/定位、重复按钮/空栏）；另 1 fail 是新增发布包 fixture 未补 tags，诚实保留。
- `engine-layout-green-first.log`：125 pass / 1 fail，仅上述不完整 fixture，随后补完整。
- `engine-layout-green.log`：130 pass / 7 fail；新增状态 fixture 把契约可选 string errorCode 错设 null，真实 strict schema 拒绝，未改契约而修 fixture。
- `engine-layout-green-final.log`：136 pass / 1 fail；共享重查 fixture 重用已消费 Response，修为每请求生成新 Response。
- `engine-layout-green-verified.log`：前一轮 5 文件 137 tests PASS，retry 0。
- `storage-quota-red.log`：首次新 quota 测试无效，因全局 StorageMock 不是 Storage.prototype；此伪阳性不作产品证据，随后修正为实际当前 storage 对象的 prototype 并断言被调用。
- `storage-quota-real-red.log`：实际只写失败而读取正常时 1 fail，偏好被旧存储值吞回；修为会话内明确选择仍执行，并验证跨窗新选择接管。
- `engine-layout-final.log`：最终 5 文件 138 tests PASS，retry 0。共享偏好、状态、设置卡、聊天交互、脚本顶条与设置定位。
- `engine-layout-regression.log`：4 文件 53 tests PASS，retry 0。原聊天结构、设置页面结构、项目真实作品 tabs。
- `engine-layout-lint-delivery.json` / `lint-summary.json`：13 文件 0 error / 3 warnings，均原 ai-copilot-content 的 hook 依赖项（上下文/transport/历史 scope）；`copilot-lint-baseline.json` 当场读取原源码核对也是相同 3 warnings / 0 error；没有静默加禁用注释。
- `engine-layout-tsc-first.log`：实际首次类型检查，2 项新增类型问题（fixture coverAssetId、抽 Boolean 失去 JSX narrowing）已修。
- `engine-layout-tsc-delivery.log`：剩余 23 项均本隔离快照未复制 public/courses/xuehui-ip-practical-course 的 JSON，不是本任务类型错误；不能写全项目 tsc PASS，请主会话在完整树复跑。
- `delivery-manifest.json`：逐文件原 / 新 SHA；原 SHA 当场与根工作树及 source-before.json 一致。
- `scope-check.json`：所有改动 / 新源文件只在授权 13 文件，outsideAllowed = []。
- `settings-engine.patch`：上述 13 文件的增量，不含继承混合 WIP；根工作树 `git apply --check` PASS。

## 限制
未运行浏览器、模型、真实执行器或系统剪贴板。上述 jsdom / 组件 / 真实 transport request 构造测试使用状态 API fixture，不声称真实 Codex 任务执行结果或像素验收。没有安装依赖、写控制面、改合同 / backend / 文章 / 图文 / NoteRelay。
