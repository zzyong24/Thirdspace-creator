# T-1071 账号绑定与Tab切换性能

用户2026-10-07反馈：点击“账号组与绑定账号”以及任何Tab页签切换都特别卡顿。本任务优先于T-1070补充剪辑验收；原任务与已生成本地包保留。

目标是点击后及时出现目标内容，且重复切换不积压请求、不丢未保存作品、不串组。保留现有丰富紫色页面和真实导航合同；不凭缓存隐藏失败或过期数据、不删除合法任务和历史、不改变生成/权限/归属。

```mermaid
flowchart LR
  A[点击页面或页签] --> B[路由与请求]
  B --> C[本地服务与查询]
  C --> D[界面渲染]
  D --> E[可见内容]
```

当前为只读核因：核对当前运行App、加载源与端口，记录上述分段耗时，并与隔离验收库的当前源对照。尚无根因结论，不准凭假设修改产品。优先检查共享导航/布局、组列表与Tab装配；当前用户客户端不强制退出、不丢未保存状态、不修改真实数据或启动新模型任务。

根因证据得到后补充精确产品写集、行为及必要回归，并独立评审后实施。服务契约/数据归属/产品方向保持；如证据要求改变则另记DEC与实际用户决定。UI交互变动依项目oil-ui-pro 0.10.0及账号组UI_RULES，留同视口视觉和实际操作证据。

验收要求：同条件前后分段耗时；真实账号管理导航与脚本/文章/图文/视频Tab点击；重复切换不堆在途/拒迟到回写；未保存内容与原合法保存导出不倒退；执行LED-047相关回归和范围内类型/公共链路测试。超时改动按LED-053验证真实消费者和公共链路，不缩短执行期限。隔离数据测试与当前安装版分别记录，不代签用户最终验收。

本地包按已授权固定入口冻结源码出包；当前App未保存状态尚未确认，替换前仍待该事实。不得push/tag/公开发布。全过程记录真实FAIL与缺失，不补拍历史PASS。

当前准入写集仅控制文档：本SPEC、BACKLOG.md、T-1071对应模块配置/任务上下文/事件/阶段记录与诊断证据。产品源码写集待实际核因。

## 已核实路径与精确修复

实际安装版PID96205、端口55382；与已生成82406168新包不是同一可执行文件。只读HTTP /accounts独立返回75、101毫秒，不能代表点击全过程。安装版3.5秒CPU采样主要在PGlite执行与文件系统；6秒临时探针119次查询、无DML，查询耗时合2486毫秒。最慢恢复扫描单次EXPLAIN执行6.512毫秒/返回0，await包含排队，禁止据此声称加索引已经解决。后台查询优化仍待准确因果与精确范围，本补充不调整调度或数据库。

当前源隔离库实际视频→文章点击3710毫秒，RSC请求3304毫秒；隐藏视频随后再次调用outputs.production.editor.get并读取同一素材。真实StageChatWrapper源码私有React生命周期探针：同key stateful子树active=true→false→true，mount=3、unmount=2且未保存state重置；原因是有编导栏时两层div、无编导栏时Fragment改变子树身份。此探针不能代签安装版或真实原生数据保留。

修复限定原合同下的四个前端路径：

- `frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.tsx`：显式active的常驻宿主保留相同根与编辑器容器结构，隐藏时只卸载编导栏、传递visible暂停原生播放；未传active的原稿面透传保持。原右栏宽度、键盘、窄窗和主题不变。
- `frontend/src/components/navigation/project-stage-stepper.tsx`：页签Link设置prefetch=false，与主侧栏已有基线一致；保留真实href、点击/键盘/后退导航与原子树。
- `frontend/src/components/shell/account-switcher.tsx`：账号组管理Link仅取消未点击页面预取，实际点击导航及切组归属和离开守卫不变。
- `frontend/src/features/platform-account/account-manager-page.tsx`：accounts、capabilities、groups并行读取；能力失败仍局部降级，账号/组读取错误语义保持。组管理mount刷新与事件失效保留，不能用未绑定scope/version的SSR数组冒充当前值；两种不同能力契约不混用。

配套测试精确路径：既有`frontend/src/app/(creator)/projects/[projectId]/stage-chat-wrapper.test.tsx`、`frontend/src/components/navigation/project-stage-stepper.highlight.test.tsx`、`frontend/src/components/shell/account-switcher.test.tsx`，新增`frontend/src/features/platform-account/account-manager-page.test.tsx`。先真实RED验证窗口state/句柄身份不丢及三个读不串行，再实施、GREEN。实际浏览器同一中性工程切页前后核shadow host身份、未保存输入、工程/素材GET数量、可见内容耗时；键盘与窄窗/200%保原布局，LED-047和前端类型回归。

上述范围是用户“卡顿需修复”已授权行为修复，不改变产品方向、服务契约或数据归属、不新增缓存/队列/执行权/能力。实施前须独立评审此完整SPEC；未评审不写产品。修复完成后重新冻结出本地包，安装版尚待当前未保存状态事实及实际重启/切页验证，不代签整个T-1071。
