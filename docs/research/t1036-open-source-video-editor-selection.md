# T-1036 开源视频编辑组件选型与真实兼容探针

日期：2026-10-01。结论：采用 **@xzdarcy/react-timeline-editor 1.0.0 作为时间轴交互组件**，不使用其 engine 再造视频合成；制作工程仍归 production，预览仍使用现有 HyperFrames HTML 模板。组件层验证通过，尚未接入 CreatorOS 客户端；完整工作台、数据归属和双平台实包留 T-1037—T-1041。

## 候选比较

| 官方来源 / 固定版本或 commit | 许可与实际状态 | 决定与边界 |
| --- | --- | --- |
| [React Timeline Editor](https://github.com/xzdarcy/react-timeline-editor)；HEAD 4148f4a837dd767ea66807560d05bc7b65c7e578；npm 1.0.0 发布 gitHead 413a66ba3da4338a17529a6d7030d271013ec8dd | MIT；stable ID/start/end/ref.setTime、move/resize/click 回调，peer React >=18 | 选择组件级复用。公开包完整性与 dist runtime 校验通过；真实 React19/Next16 严格类型和 webpack 构建通过 |
| [OpenCut](https://github.com/OpenCut-app/OpenCut)；e668010778568641babef2cc40be4703ae6916d6 | MIT；重写中，Editor API/插件/Rust核心等是路线图 | 不把未来能力作为依赖；工程/命令思路继续参考，未执行仓库脚本 |
| [OpenCut Classic](https://github.com/OpenCut-app/opencut-classic)；cf5e79e919144200294fb9fed22a222592a0aeea | MIT；官方归档 2026-05-17，不再维护 | 保留布局/编辑历史参考；当前已有合成器和资产服务，整体替换成本较大，未运行整仓 |
| [Twick](https://github.com/ncounterspecialist/twick)；3044c23e282b87c639c3f0b3fd5fb3fd972aa04c | [Sustainable Use License 1.0](https://github.com/ncounterspecialist/twick/blob/main/LICENSE.md)，不是 MIT | 不作为本轮依赖；整套 timeline/canvas/播放器需额外许可和内核适配核验，未运行 |
| [Clawnify OpenCut](https://github.com/clawnify/OpenCut)；334477f9620a923c83458fb574e48dd0b8af498d | 与 OpenCut-app 不同；应用 MIT，HyperFrames Apache2；有托管渲染路径 | 保留 HTML 编辑参考，不引入托管 renderer、第二资产或任务账本，未运行 |

## 当场执行与观察

1. 执行目录 /tmp/creatoros-t1036-probe；只使用生成的 32 秒色块视频和 SVG，没有加载用户素材、数据库或 Cookie。
2. 完整 Next 新环境安装遇网络中断/下载停滞并终止，失败日志保留；改为新建 component-install，官方 npm registry、ignore-scripts 安装候选和固定 React19.2.4：**22 packages / 1s，exit 0**，真实 package-lock.json 已保存。Next、React、TS、GSAP 编译使用本机既有同版本包的只读链接，runtime-lock.json 如实记录，不声称完成了全新 Next 或桌面依赖安装。
3. Next16.2.9 + React19.2.4 + strict TypeScript + webpack：最终 build exit 0，完成 compile/typecheck/static generation。失败回执也保留：探针最初用了不存在的属性、Next 默认非严格类型与项目不一致、前次中断后缓存出现 syntax error；按实际接口/strict 配置修正并仅清理探针 .next 后通过，未改生产代码。
4. 官方 npm tgz SHA512 与 metadata integrity 完全匹配，安装 dist/index.es.js 与 tar 内文件逐字节一致。见 reference/integrity-check.json。
5. 浏览器点击真实 broll-1，输出稳定 ID；参数 8–18→6–14 驱动 generateVideoRenderHtml；拖动真实 moveEnd 8–16，伸缩 resizeEnd 8–18；2× 缩放下 8 秒片段宽 480px，符合 60px/s。读回模板 hash 随明确时间改动变化。
6. 千项/600秒数据：10轨×100项，DOM观察 1000 action，记录初绘两次 rAF 186.2ms（单次本机观察，不是用户性能承诺）；选中 long-0-1，resizeEnd long-0-3 18–28，moveEnd long-0-3 24–34。当片段很窄时两侧 resize 热区会占满；正式版需缩放后操作和清晰选中反馈，不能照搬测试标签。长片模式只测时间轴，画面预览仍是32秒样例。
7. 发现只 seek GSAP 时字幕 clip 生命周期不受控，初版预览错误显示最后一行；在探针补齐 HyperFrames 的 data-start/data-duration 显示协议后，3秒只显示第一行，10秒只显示第二行，7秒显示6–14秒图片及第一行。源模板函数未改。正式预览必须保留此协议，并通过实际成片对照验证，不把函数复用当成预览准确的全部证据。
8. 拖动/伸缩开始必须同步选中 ID，点击用 onClickActionOnly，避免结束拖动时额外跳播放头。探针已补齐，最终回执 moveStart/moveEnd 与 selected 同为 broll-1。

## 可复用边界与后续落实

- TimelineRow/action 只是制作方案的 UI 投影；后端生成并校验真实 item ID，组件不能创造账号、资产或版本。
- ref.setTime 与 cursor/time 回调连到唯一预览时钟；autoReRender=false，不使用候选自身 engine 执行另一路内容动画。
- 手工和编导修改先走同一公共 editing operation；onChange 不直接落库，服务端校验归属、范围、CAS 与幂等后回读。
- 第三方组件使用客户端动态加载 ssr:false；CSS 放布局或受控全局入口；不要把第三方包泄漏为服务合同。
- 保留 MIT 通知并记录传递依赖许可；正式 pnpm 锁文件与离线桌面闭包必须在 T-1038/T-1041 接入后核验。此处没有验证 Turbopack、Windows、安装版、长视频实际媒体吞吐或真实模型修改。
- 故障降级保留参数编辑和既有制作流程；不以组件加载失败阻断已有生成/导出。

## 证据与复核

持久目录：[evidence/t1036](evidence/t1036)。源文件、官方包、metadata、MIT LICENSE、锁文件、build/安装回执、HTML及截图由 hash-manifest.json 逐项绑定。最终画面见 same-composer-final.png；真实短片回调见 short-interactions-final.txt；千项记录见 large-interactions.txt。

重现：在隔离目录安装声明版本（禁生命周期脚本），复制已保存 app/public；route 中现有模板与契约导入必须指向本项目。执行 `node node_modules/next/dist/bin/next build --webpack`，再 `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4192`。不运行参考仓库自带脚本。正式产品 API 与 UI Gate 不能用此样例证据替代。
