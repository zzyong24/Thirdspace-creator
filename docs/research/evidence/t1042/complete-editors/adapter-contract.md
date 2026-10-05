# 完整工作台最窄适配合同（待独立复核）

复用官方 OpenCut Classic 完整四区与快图设计完整三栏，不重写其编辑内核；提取纯前端入口为独立静态构建，同源嵌入，不部署第二后台。

- 账号/项目/output 由 CreatorOS 父稿面确定；frame 不接受账号token，不选择或创建独立业务项目。消息双方只承认同源、确切 window/source、每次挂载随机session、唯一requestId与协议version=1，frame的临时 projectId由host给定。frame自己的持久化适配器读写仅临时内存，保存以用户点击父稿面保存为准；不使用其云、IndexedDB项目库。未知消息零保存。
- 图文使用原 GraphicPostDocument 增加可选 `designs`，每项明确target={kind:cover}|{kind:card,cardId}，editor=`kuaitu`、锁定revision、nativeDocument=完整JSON、mediaRefs=[{mediaId,assetId,assetFileId}]。同target唯一，cardId存在；所有新增/更换引用经原assertAssetFile权限校验，未动旧引用沿原历史兼容。图层原生JSON不补写正文/简介/标签。保存走原createGraphicPostVersion CAS和原request。
- 视频沿原Production owner/版本/CAS，以 `editorVersion:3` 表达 OpenCut原生工程，referenceEditor={editor:opencut-classic,revision,nativeDocument,mediaRefs}；完整保留JSON，引用唯一真实媒体ID和Asset/file。仅用户明确切换到开源编辑器新稿时保存新形态，原方案在正式历史保留；普通旧v1/v2保存不能覆盖v3，普通v3保存不能悄悄覆盖已编辑的旧形态。需要切换时body可选 `replaceEditor:true`，由UI明确说明原稿保留并选择继续，后端只落实显式选择。
- 视频原生文档媒体必须对应 mediaRefs，序列化去除File/Blob/objectURL，nativeDocument里的媒体只存mediaId；加载时父页面取真实exact-file URL并fetch File，帧内用真实File还原。临时文件首次导入经父页面原createUpload/PUT/completeUpload，再加入具体作品原material link，原生mediaId明确关联真实fileId；失败保留输入不产生假保存。图文JSON src归一为 creatoros-asset://assetId/assetFileId；读取用确切媒体引用转换为当前URL，未知外部URL禁止带入保存。
- frame load/snapshot/export/insert-media/changed/error 是机械操作，不智能归类或选素材。业务保存与上传在父页面按原API执行。frame切换作用域重挂载，旧session晚回复丢弃；多次请求限制在途。
- 图文导出的PNG沿原Assets原上传，绑定具体cover/cardId且随后原图文CAS保存原生JSON和新导出file。视频导出沿OpenCut本地SceneExporter，浏览器可下载MP4；采纳到作品沿原上传成品能力，不能把仅本地下载称已入作品。当前原HyperFrames渲染不接受v3，不显示或请求其收费渲染；用户原旧方案仍从历史恢复后可沿旧链。
- 任何转换不能保真时不强做转换、不用静默空稿替换：打开新的原生编辑草稿时说明原稿保留，用户明确保存才建立新版本；原新稿最少可导入旧工程所有真实媒体，编辑任意文字/图片/视频片段。

验证：新增契约/owner测试，跨账号拒绝新媒体、重复request相同回执、CAS冲突保留输入、原v1/v2回归、真实JSON保存刷新、两作品晚回复防串、PNG/MP4打开、浏览器正常/最低窗口实际操作。安装版与真实供应商未跑的结果明确保持未验。
