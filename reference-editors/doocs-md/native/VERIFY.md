# T-1053 · Doocs 原生候选验证

本次未运行浏览器自动化。独立源码候选由 `/tmp/t1053-native-doocs/` 接续；正式共享 checkout 未由本子代理写入。

| 实际执行 | 结果 | 证据和边界 |
| --- | --- | --- |
| 原完整 Web `vue-tsc --project tsconfig.app.json --noEmit` 与 Vite 原生 ESM 构建 | PASS | `build-verified-final.log`，构建脚本先执行类型检查，任一步非零退出即失败 |
| 原生同文档 lease 两个 Vitest 测试 | PASS，2/2 | `lease-green-final.log`，旧实例完全关闭后替换，等待挂载取消不能取得 lease；原 vitest 配置 __dirname 未来兼容警告保留 |
| 实际 `dist-native/native.js` 的 Node+jsdom DOM 夹具 | PASS | `dom-final-environment.log`，真实原组件/CodeMirror/HTML 引擎、load/snapshot/export、精确图片和同owner重新加载、代码块字面值、缺图降级、File原对象经宿主回执、迟到上传不改新owner、主题不改nativeLayout、portal/禁用、body不锁、lease/取消/销毁、旧request拒绝、title/lang/head/body/localStorage无外溢 |
| 构建图、ESM相对依赖与CSS资源路径 | PASS | `artifact-final.log`，2823模块、186依赖、890个静态/动态相对import检查；原Vue/CodeMirror/PreviewPanel/RightSlider/core renderer确实出现在构建图，native.css资源URL都在相同本地发布目录 |
| 同锁两个独立源码目录复建逐文件比较 | PASS | `rebuild-determinism.json` 与 `build-deterministic-extracted.log`；源码及 395 个产物文件（含自身哈希清单）逐字节一致，不联网重装依赖 |
| 图片合法属性与响应式来源回归 | PASS | `image-seven-families-red.log` / `image-seven-families-green.log`；reviewer 原 7 族实际 ESM 红绿。最终 DOM 夹具另覆盖 14 组 img/picture、8 组 SVG 图片和 2 组安全 data 图，预览与 HTML 导出都检查且不改原 Markdown |
| 无 process 的实际 ESM 生命周期 | PASS | `no-process-red.log` / `no-process-green.log`；导入前删除全局 process，从真实挂载至编辑、导出、File回执、换稿和销毁全程无 process，结束后才恢复夹具环境；reviewer 原探针另见 `no-process-reviewer-green.log` |
| JS AST 生产宏检查 | PASS | `artifact-final.log`：197 个实际 JS 文件解析，未替换 process.env.NODE_ENV 宏为 0；字符串示例不计入宏 |
| 相对T1049基准补丁空白检查 | PASS | `whitespace-check.json`，逐文件 `git diff --no-index --check`；父会话仍需对集成后的共享diff执行最终门卫 |

DOM 夹具补齐了 jsdom 已有 Window、NodeFilter、HTMLImageElement 等真实 DOM 构造器。它显式模拟 ResizeObserver、空 Range 几何和 scrollIntoView；execCommand 返回 false，没有模拟 Clipboard 成功。图片是带明确 image MIME 的非像素 File/Blob 夹具。Reka 内部标题/描述诊断使用 document ID 查询，不能找到 ShadowRoot 中已有的 DialogTitle/Description，早期构建打开两个文件对话框时记录了相应警告，保留在历史日志；可访问性和真实焦点/层级继续待验，不声称该项全绿。

真实浏览器亮暗像素、布局、宽度/滚动、焦点和层级、系统 Clipboard、图片像素、HTML资源ZIP人工质量、远程 MathJax/PlantUML与复杂图表未获证据，继续待验。服务器静态资源HTTP路由在父会话集成后验证。没有把旧独立页/iframe测试算作本次原生验证。

实际失败日志保留：首次类型检查因临时 node_modules 指向旧源码失败；第一次DOM夹具暴露Blob URL被净化器删除；早期默认示例稿触发图表和公式加载；后续jsdom环境缺失构造器导致的失败也保留。已经修复相应代码或夹具环境，最终PASS只覆盖上述断言。这些日志不能冒充其它前置TDD、独立评审或真机E2E的历史证据。

许可：原项目WTFPL LICENSE随源码和dist交付。构建依赖记录保留186个实际npm包的声明许可和随包许可证文件；measury、qiniu-js两个实际编译包没有随npm包提供独立许可证文件，这一缺口原样记录，不补造版权文本。

## 本轮源码复建差异与修正

第一次归档解压后重建确有差异，不能算可复现 PASS。两边完整运行源码及锁文件相同，旧构建图也相同（2849 模块、193 依赖）；差异来自 Rolldown 输出中依赖缓存的相对路径诊断注释，以及 Tailwind 默认扫描候选工作区中的工具文档等非运行源。原生配置现在在块哈希前通过真实 JS 解析只删除 region 注释；字符串、其它注释及许可证保留。Tailwind 使用 source(none)，显式固定到 Web/shared/core 源目录。构建图的缓存路径、排序与许可文件顺序也统一。打包前清理旧 native 目录，避免旧哈希块残留。

本轮分别在候选与独立解压目录运行原生构建，复用已安装的同锁依赖缓存，@md/core 与 @md/shared 均指向各自解压目录。独立解压目录先执行了原 postinstall 的 wxt prepare。验证脚本核对源文件、锁文件、实际依赖路径、每个构建文件及 SHA 清单，记录在 rebuild-determinism.json；不声称另一个操作系统、CPU架构、Node/pnpm版本或不同依赖也已验证。

独立实现评审暴露了合法 alt 属性中 > 导致图片正则漏检，以及 picture/source 和 SVG image 的外链来源。图片解析现在使用惰性 template，遍历真实 img、picture/source、svg image；精确素材 token/已注册 Blob 继续绑定，未知来源局部占位，保留其它属性、原 SVG 向量层与规范正文。明确 image MIME 的内嵌图仍可用于原数学/图表图片。image-attribute-red.log、image-seven-families-red.log、svg-image-red.log 是实际执行失败；最终绿测只证明夹具断言，不能扩大成真实网络、像素或任意 MathJax/图表质量结论。

## 生产环境启动修正

独立评审在导入前删除 Node 的全局 process 后，旧 library 产物在 Vue 的 process.env.NODE_ENV 处直接 ReferenceError，尚未挂载；本轮已实际复现失败，保留 no-process-red.log。Vite 原生配置现在显式 mode: production，define process.env.NODE_ENV 为字符串 production，由构建替换宏，不注入运行期 process 兼容对象。生产分支裁剪后，最终构建图为 2823 模块、186 依赖；前文“旧构建图 2849/193”只描述上一轮差异排查的历史事实。最终 DOM、图片、lease 与无 process 夹具重跑通过，双目录比较也使用本轮生产产物。
