# T-1049 CreatorOS 网页适配合同

状态：已独立复核并进入实现；代码与构建记录见 `docs/research/evidence/t1049/implementation-web.md`，用户网页验收仍待完成。范围由 DEC-T1049-01 授权，交付 CreatorOS 本地网页工作台供用户验收；不授权部署、推送或对外发布。

## 作品真值与上下文

- 宿主由 CreatorOS 已登录账号、项目、`outputId` 和当前文章版本启动公众号编辑器。切换作品必须先处理未保存草稿；消息必须绑定本次随机会话 ID 和 `outputId`，过期会话、来源错误和字段不匹配全部拒绝。
- `backend/articles` 是文章正文及正式版本的唯一 owner。父级 React 页面仍使用现有 contract client/RPC；嵌入的 Doocs Web 只经 `postMessage` 请求上下文、保存、图片解析和导出，不直接访问数据库、合同以外 API、客户端凭据或本地正式文章库。
- iframe 使用 `sandbox="allow-scripts allow-downloads"`，不授予 `allow-same-origin`、表单提交、弹窗或顶层导航能力；其 origin 为 opaque `null`，不能访问父页 DOM、Cookie、localStorage、IndexedDB 或同源登录接口。父级只向这个具体 `contentWindow` 接受消息，并校验 `event.origin === "null"`、一次性随机握手 nonce、活动 `sessionId`、协议版本和严格消息 schema；向 opaque frame 发消息时使用 `targetOrigin: "*"`，但只发非凭据的作品文档、会话上下文、明确的 Assets ID 与受限图片 Blob。跨站请求由宿主按现有 RPC 发起。消息能力限于文档字段、请求标识、素材 ID 与导出结果，不允许任意 URL、命令或凭据。
- Doocs 工作面只能以内存承载当前标签页编辑；必须禁用上游 IndexedDB/LocalStorage 文档持久化、同步、账号登录、图片上传服务和 AI 配置。正式 owner 未保存成功时不得把文档写入 iframe 存储并显示“已保存”。

## 双向文档映射

- 启动快照包含 `sessionId`、`accountId`、`projectId`、`outputId`、`sourceVersionId`、CAS 版本标识、标题、摘要、完整 Markdown、稳定段落 ID、正文图片 `assetId/assetFileId` 引用、封面及已保存原生排版文档附件版本。
- Doocs Post ID 固定映射为 `outputId`；不得由编辑器生成新的正式文章 ID。映射格式固定为每个 CreatorOS section 前置 `<!-- creatoros-section:<sectionId> -->`，其后 Markdown `#` 至 `######` 标题作为该段标题及 `headingLevel`，余下 Markdown 正文作为 `body`。保留的 section 更新原 `sectionId/order`；新增、删除、重排只由宿主显式选择的 section 操作生成稳定 ID/order；锚点缺失、重复或未知时禁止保存并明确报错，不用标题文本相似度推断身份。
- CreatorOS 字段映射限于 `title`、`summary`、`sections[].heading/headingLevel/body`、`imageUses` 中由宿主校验的 Assets 占位符和版本化 `nativeLayout`。来源引用、事实清单、视觉简报、封面引用及任何未映射字段由宿主以打开编辑器时的当前完整 ArticleDocument 为基线原样合并；编辑器从未提交这些字段，不得清空或重写它们。`imageUses` 只能由 `assetId/assetFileId` 占位标识解析并经 Assets owner 校验，临时 URL 不写入正式 Markdown 真值。若任一原稿字段不能保留，拒绝保存，不提交部分文档。
- 正文图片占位格式为原始 HTML `img` 的 `src="creatoros-asset:<assetId>:<assetFileId>"`，并由 CreatorOS 段落 `imageUses` 保持唯一正式关联。正文 Markdown 导入、粘贴与保存时，所有其他正文图片 `src`（包括 `data:`、`blob:`、`http(s):`、相对路径和 `/` 站内路径）均拒绝并给出可操作错误；用户须通过宿主“插入素材图片”操作选择已归属校验的文件。此项不限制编辑器自身打包的静态 UI 图标/资源，它们不属于正文且不能写入文章。宿主将用户选择的精确文件 ID 写入当前段落并向 iframe 注入占位符。Doocs 预览 renderer 将占位符映射至 iframe 内由传入 Blob 建立的 object URL；CodeMirror 原始内容和正式保存永远保留占位符。
- 代码块/编辑区按原始 Markdown 字符串往返，不经 HTML 转换或 Markdown AST 归一化；Doocs 的 CodeMirror `getContent/setContent` 路径及 `formatContent`、粘贴、Markdown 导入分别用固定中文、HTML 注释、代码围栏、复合标题样本验证 `creatoros-section` 注释原样保留。若任一流程移除锚点，宿主阻止保存；恢复只能用 checkpoint 中完整原始 Markdown，不能重建标记。每个锚点后的第一个行首 Markdown 标题只作该 section 的 `heading/headingLevel`；其后至下一锚点之间所有标题行均为 `body` 内容，保留其级别。正式字段 `headingLevel` 随 ArticleDocument 保存；旧数据读成 2。
- 共享 contract schema 必须实现 `articleSection.headingLevel: z.number().int().min(1).max(6).default(2)`；旧段落缺字段按 H2 读取。新增 `articleDocument.nativeLayout` 为可选 strict schema：`{schemaVersion: 1, editor: "doocs-md", editorCommit: "a7c17fc4cda92e3c13aa7e24f06615cfa4219b31", themeId: string(1..128), themeSettings: JSON object (UTF-8 <= 64 KiB), customCss: string (<= 50 KiB), exportOptions: {useIndent: boolean, useJustify: boolean}}`。拒绝未知顶层键、非 JSON 值、超长或重复键。历史版本无该字段时解析为无值并按内建基础主题处理；不改写旧版本。
- `nativeLayout` 直接纳入同一 `articleDocument` schema 与 `createArticleVersion` CAS 版本；它绑定所在文章版本，不新增附件表、独立保存操作或部分成功窗口。`themeSettings` 按契约 JSON object 经 canonical `JSON.stringify` 后使用 `TextEncoder` 计算 UTF-8 字节数，最多 65,536 字节；不接受原始 JSON 文本输入，因此不存在重复键输入。每次完整正文/版式保存用一次现有 backend articles CAS 和请求收据，读回必须比较完整文档及 `nativeLayout`。

## 保存、冲突与恢复

- `save-request` 携带会话 ID、请求 ID、原 `sourceVersionId`、完整合并后的文章文档和 `nativeLayout`。宿主在调用 backend 前，以 `accountId + outputId` 为键将不含凭据的完整请求体与 ID 写入宿主侧会话恢复存储；写入失败时不发起保存。保存后根据 `createArticleVersion` 返回的 `versionId` 调用现有 `getArticleVersion(outputId, versionId)` 精确读回本请求版本，同时调用 `getArticle` 读取 current。精确版本完整文档一致即记录“此请求已提交”；current 若已前进则另外显示并发冲突，保留当前草稿，不能将已提交版本谎报失败，也不能自动覆盖后续版本。
- `createArticleVersion` 现有 idempotency receipt 是唯一重放机制：其 adoption key 为 `article-edit:<clientRequestId>`，同 key 且同完整请求 digest 会返回既存版本；同 key 不同请求体失败。宿主为此请求 ID 固定绑定一个 output，禁止跨 output 复用。若收到保存响应但版本读回未知，刷新后先按固定 output 重放同一 ID 与逐字节相同 payload 取回 receipt/versionId，再精确读回该版本并读 current；不得换 ID 或改 payload。request ID 至少 8 位并不超过 128 位，按每次不同 payload 新建。
- 宿主只在顶层页面将非正式草稿 checkpoint 和完整原请求写入 `sessionStorage`，分别用 `draft:<accountId>:<outputId>`、`request:<accountId>:<outputId>` 键，保存在本标签页；它只用于刷新恢复，始终显示“未保存草稿”，不是正式版本、共享来源或第二个正式 owner。checkpoint 延迟合并写入完整文章草稿及 `nativeLayout`，每次编辑更新并记 `sourceVersionId/updatedAt`；保存请求先冻结相同文档与幂等 ID。
- 每键数据最长 24 小时；先校验过期/账号/output/source version 再显示和恢复。源版本仍 current 时可恢复到编辑态；源版本已变化时只读展示旧草稿与新 current，用户明确比较/选择前禁止保存。请求回执检查和草稿恢复不得跨 account/output，标签页互不广播。成功读回、用户明确放弃或过期时清理对应记录；浏览器刷新保留该 tab checkpoint；关闭 tab/session 自然销毁。显式退出当前账号时清理其 checkpoint。写入失败时仍留在当前内存编辑态并显示刷新将丢失提示，保存恢复记录写入失败则不发送保存请求。
- 不得放入 URL、localStorage、IndexedDB、持久化日志、共享/云端位置或跨标签页广播；不包含凭据。此恢复材料在同一 OS 用户下可读；登出时清理当前账号 checkpoint 并清除编辑器消息会话。

## 图片与导出

- 编辑器正文图片只接受 CreatorOS `assetId/assetFileId` 关联；宿主通过既有 Assets contract 取得临时显示 URL，并用不可编辑的 `creatoros-asset:<assetId>:<assetFileId>` Markdown 占位符关联。解析/保存器必须逐个检查 Markdown 图片与 HTML `img[src]`，拒绝所有非该占位格式的正文图片来源，包括 `data:`、`blob:`、`http(s):`、相对路径及站内路径；错误定位到含图片的段落并保留当前未保存草稿，指导用户重新从 Assets 插入。编辑器静态 UI 资源只来自打包文件，不进入文章正文。临时 URL 不得写入正式 Markdown 或当成永久可访问地址。
- 微信 HTML 导出需消费已读回的正式版本与绑定附件，将 Doocs 实际主题样式写入独立 HTML；ZIP 中包括所有正文用到的真实图片文件，HTML 使用 ZIP 内相对路径，并附资源清单、`outputId`、版本号与顺序。私有本机图片 URL 不得被宣称可直接粘贴到微信。
- 若同一已读回文章版本没有可用 `nativeLayout`，继续使用 Doocs 内建基础公众号主题输出**当前已读回正文**和实际图片；在文件清单及界面明确标记“基础排版”，绝不将绑定旧 `sourceVersionId` 的主题套在新正文上。正文和主题随同一 CAS 原子保存，因此不存在主题单独保存失败的正式部分版本；CAS 失败保留完整本地请求与草稿，导出仍可基于前一正式读回版安全继续。
- HTML 与图片 ZIP 在宿主经原有 Assets 下载 contract 取回文件后生成；任一必需图片缺失时，导出明确失败并列出图片，不跳过节点。无模型时仍可手工编辑、保存、刷新恢复和导出。
- iframe 对每个 `resolve-asset` 消息只传 `assetId/assetFileId`；宿主按当前 RequestContext 用 Assets owner API 校验归属并取得授权文件字节，将受限 `image/*` Blob 经 `postMessage` 传入对应 frame。拒绝任意 URL、非图片 MIME 与超过 25 MiB 的单文件；超限时显示原生 Assets 链接/错误，不丢正式引用。iframe 建 `URL.createObjectURL(blob)` 仅供预览 renderer 使用，在文件替换、作品切换与 frame 卸载时 revoke。正文渲染只可将经过解析器验证的 CreatorOS 占位符映射到这些 Blob URL；`img-src 'self'` 仅服务 iframe 自身打包的 UI 资源，`data:` 不在 CSP 白名单内，任何正文来源绕过解析器也无法取得图片预览。导出同样由宿主取精确文件字节并打包 ZIP。

## 消息安全与生命周期

- iframe 固定指向内置 `/reference-editors/doocs-md/index.html`，并以 sandbox opaque origin 隔离；不接受任意外站来源、源窗口或过期 nonce。消息进一步校验 `event.source`、opaque origin、会话 ID、操作名、协议版本和 schema。禁止接收编辑器直接传入的任意请求 URL、文件路径、HTML script 或身份标识覆盖值。
- 编辑器 HTML 声明 CSP：`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; font-src 'self' data:; worker-src 'self' blob:; media-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`。构建适配移除上游 inline boot script 与 Google Analytics 后仅用打包本地静态 JS；样式中的 inline 属性因 Doocs 主题预览需要保留。`img-src 'self'` 只允许 iframe 打包静态 UI 文件，正文图片仅通过宿主授权 Blob 映射到 blob URL 显示；`data:` 不可作为图片来源。字体与媒体的 data/blob 权限不等于文章图片权限，解析器仍拒绝将这类地址写入正文。任何脚本网络连接、上游统计、远程字体/图片、图床、账号同步及 AI 请求均被浏览器阻断。新增资源来源必须收录在许可证/来源清单及 CSP 白名单复核中。
- 父页面卸载、账号变化、输出切换时终止会话；过期响应不得回写其他作品。消息、错误、运行记录不包含访问令牌、模型密钥、私有 URL 查询参数或正文内容。
- 参考源码固定在 `a7c17fc4cda92e3c13aa7e24f06615cfa4219b31`，WTFPL。产品构建移除 Google Analytics、外部运行时网络和非必要第三方请求；保留上游 LICENSE/NOTICE 和实际静态资源来源清单。

## 可验证旅程

1. 从已有公众号作品打开，编辑标题、段落结构和真实 Assets 图片，调整主题和移动预览，保存并由宿主读回单一文章版本（正文及 `nativeLayout`）。
2. 刷新后正式正文、段落 ID、精确图片和主题按 owner 读回，未保存草稿仅从本标签页 checkpoint 恢复；模拟响应丢失后用原请求 ID 安全恢复；用并发版本触发 CAS 冲突，确认当前真值不被覆盖且编辑器草稿和原请求仍可比对。
3. 导出 HTML 与图片 ZIP，解压后按相对路径打开，确认中文、标题/列表/表格、样式和每张配图完整；缺图时不得静默少图。
4. 无模型配置时仍能完成普通手工编辑、保存与本地导出；正式版本没有 `nativeLayout` 时以内建基础主题导出当前读回正文，不套用过期版式。
5. 端到端编辑器→锚点解析→ArticleDocument 保存→指定版本读回往返，覆盖新增/删除/重排、headingLevel、正文内多级标题、粘贴/格式化/导入丢锚点拒绝，以及冲突后以原 sectionId 恢复 checkpoint；不得按 heading 文本匹配或重建丢失锚点。

不满足或未实际执行的旅程只记待验；代码测试和构建不替代用户指定的网页视觉与交互验收。
