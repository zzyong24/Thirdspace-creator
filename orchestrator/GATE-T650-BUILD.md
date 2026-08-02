# T-650 知识倾倒拖拽导入 BUILD Gate

日期：2026-08-02  
结论：代码链已修复，保持进行中；等待统一安装包后的 Finder/Explorer 真机验收。

## 根因与修复

- React 输入区本身已有真实 `onDrop`、支持 PDF / DOCX / Markdown / TXT，并复用既有
  上传、正文抽取和知识创建链路。
- 真安装包中 Tauri 默认原生 drag-drop handler 会在 WebView 之前截获 Finder/Explorer
  文件，因此浏览器层永远收不到 `DataTransfer.files`，表现为“拖进去没反应”。
- 主窗口已启用 `disable_drag_drop_handler()`，文件事件交还 HTML5 拖放链；知识倾倒与项目
  素材区都复用现有处理器，不新增第二套桌面文件解析。

## 验证

- `knowledge-dump-zone.test.tsx`：拖入文本直接走上传并创建知识、不支持格式明确报错。
- frontend 聚焦集：5 files / 94 tests PASS。
- `cargo check --manifest-path frontend/src-tauri/Cargo.toml` PASS（仅既有 decoy dead_code warning）。
- Node `v25.9.0` 下 frontend typecheck PASS；boundary 无新增违规，orphan-scan 0 error。

## 待安装版验证

- 2026-08-02 已进入统一 `release-fast` 本地测试包；12 个打包阶段、真实 sidecar smoke、
  App TLS 自包含与 DMG 完整性校验均通过。
- 仍需在 macOS Finder 与 Windows Explorer 各拖入一份 `.md` 和一份 `.pdf`，确认
  拖入态、上传/解析进度、成功结果与失败重试均可见；本轮按用户要求不单独重复打包。
