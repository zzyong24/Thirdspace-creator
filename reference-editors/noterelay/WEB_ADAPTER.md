# NoteRelay 原生网页适配

复用用户提供的 0.1.8 实际 core、WechatAdapter、RednoteAdapter、主题和分页。原 Obsidian Plugin/ItemView 不在 CreatorOS 运行。

- `web/native.ts` 为同页 ESM 入口，挂载实际 DOM 渲染器；句柄直接处理 load、snapshot、page、select-image、export，不用 iframe、postMessage 或全局交付 receiver。
- `src/core/dom.ts` 提供显式 DOM helper；全部实际渲染调用已改为 helper、classList、原生 style，不修改 Node/HTMLElement 原型。`WEB_PATCHES.diff` 记录与附件原 src 的完整差异。
- `web/obsidian.ts` 用 DOMPurify 净化 HTML；不读取 vault，不提供特权网络请求。图片只接受宿主已验证的精确文件 Blob。
- 控件由 CreatorOS React 宿主提供，原公众号/图卡主题颜色保留。每个实例有独立 DOM、Blob URL、AbortController 与交付回调；切稿/卸载等待在途渲染与导出退出后回收。
- `web/noterelay-layout.ts` 是 `contract/src/resources/noterelay-layout.ts` 的构建复制件，合同唯一维护源保持原位置。
- `web/package.json` 固定运行/构建依赖，`web/licenses` 保留实际许可证。原 AGPL 与第三方声明保留。

在归档的 web 目录安装 package.json 指定依赖后，运行 `node build.mjs` 重建 `web/dist/native.js` 与 `native.css`。应用中运行 `pnpm --dir frontend build:noterelay`，再运行 `node frontend/scripts/build-noterelay.mjs --verify` 校验静态包、源码摘要与合同复制件。构建记录使用原渲染调用图；DOM 夹具不证明浏览器真实像素、PNG 或系统剪贴板。
