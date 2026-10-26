# T-1419 文章工作台简化与公众号排版风格恢复

2026-10-26 用户要求文章工作台不再展示“开源来源与许可”，并从历史代码找回公众号文章的多种排版风格切换。移除面向创作者的该控件，不删除随软件提供的来源、许可或 notices 文件，不改变正常保存、复制和导出能力。

用户结果：在公众号文章编辑处能直接识别并切换原有排版风格，预览立即反映选择；保存、刷新、复制公众号排版和导出沿用所选风格，切换风格不改变正文或丢失未保存编辑。先检查原风格能力是否仍在嵌入编辑器中、何次整合隐藏或丢失，优先恢复原真实功能，不另造假预览或第二套主题系统。

针对恢复的交互做风格→预览→保存回读→复制/导出同源回归，核工作区变化和未知保存回执；保留原稿、旧版本和上下文。精确路径、历史依据及验证命令查明后补本 SPEC 并独审，产品代码尚未开始修改。

## 具体修复与历史依据

历史 8bb8facc7 的脚本驱动工作台重构传入 simplified，把 NoteRelay 全部排版设置隐藏；8bb8facc7^ 的文章工作台直接挂载完整设置。主题仍在 reference-editors/noterelay/src/themes/builtins.ts（摸鱼绿、红白、石墨极简、留白、票据、手记等）。恢复简化工作台顶部直接可见的“文章风格”选择，选项取真实编辑器 metadata，不硬编码第二套主题；高级署名/变量仍折叠，候选只读模式禁改。保留现有稿件 themeId，未设置者仍使用现有石墨默认；预览、保存和导出共用同一 nativeLayout。Doocs 历史稿保留该编辑器，通过“调整排版”展开现有原生能力，不强制迁移旧稿。移除两编辑器的创作区许可控件，许可证/源码归档仍在包内。

修改 NoteRelayEditor、DoocsArticleEditor 和对应测试；必要 ArticleWorkbench 接线。验证真实主题切换回调、重绘、保存前核对、刷新回读，以及导出使用当前布局；无覆盖正文或强制迁移。

安装态风格→保存→复制复验复现 WKWebView NotAllowedError：保存异步等待后才调用 clipboard.write，离开点击手势范围。WebKit 官方说明支持 ClipboardItem 的 Promise 数据（https://webkit.org/blog/10855/async-clipboard-api/）。修复为点击时同步提交剪贴板写入请求，Blob Promise 只在原保存/版本/归属/正文校验与原生导出全部成功后兑现；任一失败或换稿时拒绝 Promise，不复制旧稿、不虚报成功。复用小工具 write-prepared-clipboard.ts 到 NoteRelay 富文本/图片/纯文本、Doocs 富文本、图文配文（同一保存等待问题）；无 ClipboardItem 的原纯文本兼容路径保留，真正拒绝权限仍报错。增加实际组件延迟保存的红→绿测试、保存失败/换稿不得写入及安装版一次点击复制回读。只写既有相关组件测试及新工具，不改系统权限或 clipboard-read。

安装态导出补漏（2026-10-26，候选 0c2877020）：图文分页 ZIP 沿共享 NoteRelay 的 Blob→anchor.download 导出后，App 主线程连续采样停在 Wry/WKWebView 下载策略的 sandbox extension 系统调用，窗口不响应，尚未证明文件写成；不是生成或保存失败。文章 HTML、Doocs HTML+图片 ZIP、图文原图配文 ZIP 使用同一路径，纳入原“复制和导出能力保留”的公共交付回归。最小修复：共享 save-editor-file.ts 在桌面调用已有 export_workbench_artifact 原生保存命令，保持原生面板选址、现有100 MiB边界、文件名/扩展名校验和 saved/cancelled 回执；Rust 已有 MIME 白名单增加 application/zip 与 .zip，不新增任意路径写入。网页继续使用 Blob 下载。前端 helper 在异步读取字节、加载 invoke 后、交给保存面板之前再检查当次稿件/归属仍有效；原各组件的保存确认、精确版本回读及生成字节校验均保留，取消或失败不得报已保存。桌面仅接受 HTML/PNG/ZIP，文字复制不走文件保存；ZIP 内容仍由原渲染器生成，不更换分页或图文内容。

验证本轮实际 Native App 无响应证据、桌面入口 RED→GREEN（禁止 anchor.click、原生调用字节/MIME/文件名正确、取消/拒绝/并发保存/异步期间换稿）、Rust ZIP格式/扩展名/大小/取消及精确字节保存测试，原组件全套导出及复制回归；最终安装逐项保存 HTML、分页 ZIP/PNG、原图配文 ZIP 和 Doocs物料 ZIP，实际文件解包和页数/风格核验，窗口仍响应。只扩写集到共享 helper/test 与 frontend/src-tauri/src/lib.rs（已有原生测试在同文件），不修改下载策略、系统权限、其他任务/模型路由。
