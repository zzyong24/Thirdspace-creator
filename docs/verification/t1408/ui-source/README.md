# T-1408 隔离源码 UI 准备

只运行正常 Next dev 和新私有库的公开建组/项目/视频操作，不含浏览器自动化。浏览器由 Root 独占 `cua_repl`；不运行旧 Ego 脚本，不读 connection/credential/license，不注入 desktop handshake。

## 来源与准备

当前准许来源：`778ea4559850b0d8dfbf279c312dc4c21d72866e`。sourceRoot必须传入工具实际返回的managed worktree，不能猜路径；脚本拒绝主目录、dirty树、真实.env及已存在的frontend/.next。Node25、pnpm10.32.1。

在隔离源码根执行 `pnpm install --frozen-lockfile --offline --ignore-scripts`。忽略安装生命周期；缺包即报告，不取消frozen、不改lock。随后在无用户环境下执行原 `node ai-worker/scripts/build.mjs`（正常predev等价的静态bundle，只写本工作树ignored dist，不调用业务）。检查Git仍干净。

在本证据目录建立`runs/`父目录。每次传入全新evidenceRoot；start只创建本目录下的单次运行目录，另建0700临时dataRoot，不复用任何现有host或数据。

```sh
node docs/verification/t1408/ui-source/ui-source.mjs start --source-root <工具返回的源码路径> --evidence-root <本目录/runs/全新runId>
node docs/verification/t1408/ui-source/ui-source.mjs seed --source-root <同一路径> --evidence-root <同一运行目录>
```

start日志位于新运行目录`next-dev.log`，runtime.json保存PID/创建时间/进程组/cwd/新origin/私有数据root及新本机userId；不保存master key。服务ready以单次公开`GET /api/v1/auth/me`完整返回为准，启动总预算600秒，不重新开启期限或重试HTTP。配置只抑制背景任务及自动配置同步，未宣称有OS禁网沙箱。

seed仅向该origin调用：accountGroups.create、projects.create(video)、projects.outputs.create(video)、settings.preferences.patch(autosaveEnabled=false)，再公开读回真实组/项目/视频。entities.json在首次操作前wx创建；任何失败或未知保原，不允许重跑同一seed制造替代对象。不会导入素材、配置模型、创建AI任务、上传日志或写用户库。未预先打开编辑器以挑热态。

## Root CUA 交接

先正常打开新origin，用界面账号组切换器选择entities.json中的真实新组，再打开测试项目的“制作视频”或其经回执核对的editorPath。不通过cookie/localStorage注入登录；单机开发态由应用真实local identity路径提供。页面出现旧origin的无关选择或错误时先核目标，不借用户平台账号。

按editor-diagnosis.md的原起止点和原动作观察：1440×900与1024×680各一次，原阈值仍`elapsedMs<=10000`。所有Cua调度开销在原wall clock内，不扣除、不改成首click计时、不强制click、不合成事件；保持未dirty、真空素材和禁用准备转写状态。此脚本只准备源码环境，永不输出UI PASS，不能代替安装态验收或覆盖旧FAIL。

收尾前由Root交接后执行：

```sh
node docs/verification/t1408/ui-source/ui-source.mjs stop --source-root <同一路径> --evidence-root <同一运行目录>
```

stop先核同UID、PID进程组、启动时间、cwd和data owner再结束本次owned Next子树；120秒未确认保留资源并报错，不动其它进程。数据和日志保留供核对，不自动删目录或任何用户缓存。
