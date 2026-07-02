# 产品审计 · 素材中心(/assets)

> 审计日期:2026-07-02。方法:宪法(docs/产品定位.md)→ 代码链路(page.tsx → assets-data.ts → contract op → persistence-client → backend service/repo)→ 真机只读验证(dev :3000,curl 页面 HTML + /api/v1/dispatch)。所有结论带 file:line 或 curl 证据;写操作(上传/附加/收藏/回收)未真机触发,只做代码链路推断并如实标注。

---

## 1. 功能定位

**页面任务**:全局素材资源库 —— 管理创作者的图片/视频/音频/文档/字幕文件:浏览、按类型筛、搜索、上传、附到项目(用料链)、看使用记录与存储占用。

**与七步流水线的关系**:对应宪法 §4 制作阶段的「管素材」职能(宪法 §8 边界:只产"文案+结构+管素材",不做剪辑)。素材经「附到项目」写 `materialLinks`(用料链,BillOfMaterials),被制作阶段的 material.match 消费。**合定位**:页面本身没有越界(无时间线/剪辑/预览播放器);唯一"下载/复制链接"做成了诚实的规划中占位。

**但与飞轮/数据底座实际断连**(见 §6 设计不合理 D-13):用户 139 个真实抖音导入项目(projects.list 实测 total=139)在素材中心没有任何对应素材 —— 素材库里只有 6 条 canonical 种子素材。宪法 §7「替换所有 mock/seed」在本页未完成。

---

## 2. 区块与交互清单(元素 | 行为 | 接线 | 状态)

| # | 元素 | 点击/操作后发生什么 | 接线(op / 路由) | 状态 |
|---|---|---|---|---|
| 1 | 工具栏搜索框(AssetsToolbarSearch) | Enter 提交 → 导航 `/assets?q=<term>`(保留 ?type);清空立即恢复 | URL 状态 → server 重读 `assets.list` → 前端在已读页(≤200 条)内做 name/description/tags 子串过滤(assets-toolbar-search.tsx:36-46;assets-page.tsx:213-226) | works(半真:无 server 端搜索参数,client-over-page,代码注释已自认) |
| 2 | ＋上传素材(AssetUploadButton) | 打开文件选择 → `assets.uploads.create` → (仅 http(s) URL 时)PUT 字节 → `assets.uploads.complete` → router.refresh | asset-upload-button.tsx:54-86 → backend assets.service createUpload/completeUpload | **suspected broken**(默认 local 后端下 uploadUrl 是相对路径,正则跳过 PUT → completeUpload fs.stat ENOENT,详见疑似 bug B-1;未真机触发验证) |
| 3 | 类型窄栏 6 行(全部/图片/视频/音频/文档/字幕) | 导航 `/assets?type=<type>`(保留 ?q),server 重读重推导 | Link href(assets-page.tsx:434-455);计数来自真读行(deriveGallery:236-240) | works(真机验证:?type=subtitle 返回 0 卡) |
| 4 | 存储空间卡(页内左下) | 纯展示,无交互 | 已用=Σ 已读行 fileSizeBytes(弱真);总额度="50 GB" fixture 常量 | works(展示);数据半真,见 D-8 |
| 5 | 全局 Sidebar「素材库存储」卡(shell 层,/assets 专属 variant) | 纯展示 | **无接线,全硬编码**:12.4/50 GB、25% 进度、"自动同步已开启"(sidebar.tsx:272-286) | **假数据**(真机 HTML 已验证渲染) |
| 6 | 素材卡(AssetCard) | 点击 → 本地选中态 → 右栏详情面板切换 | React state(assets-interactive-region.tsx:68-74) | works |
| 7 | 「共 N 个素材」计数 | 展示过滤后真实计数 | deriveGallery totalCount(真机:6;?q=无匹配 时 0) | works |
| 8 | 分页页码 / 下一页 / 每页条数 select | router.push `/assets?page=&pageSize=` → server 重渲 | **注意:server 读固定 `page:1,pageSize:200`**(assets-data.ts:221-225),URL 分页只是对这 ≤200 行的前端切片 | works(≤200 条时);>200 条静默截断;后端 op 分页本身坏(见 B-2) |
| 9 | 详情面板 · 下载 | 调 `assets.get`(确权),**不下载任何字节**,aria-live 状态行提示"文件字节下载规划中…" | assets-interactive-region.tsx:95-107 | works(诚实规划中占位;但按钮本体无「规划中」标识,见 D-4) |
| 10 | 详情面板 · 复制链接 | 调 `assets.get`,剪贴板写入 `mock://object-storage/signed/<id>` 占位串,状态行提示规划中 | assets-interactive-region.tsx:112-131 | works(占位;写给用户剪贴板的是 mock:// 假链接) |
| 11 | 详情面板 · 收藏 | `assets.favorite.toggle` 翻转持久化 isFavorite → refresh;状态行"已加入收藏。" | assets-interactive-region.tsx:137-150 → backend toggleFavorite(assets.service.ts:300) | works(写真)…但**收藏状态在 UI 任何地方都不可见/不可筛**,见 D-3 |
| 12 | 详情面板 · 更多(三个点图标) | **无菜单,直接把素材移入回收站**:`assets.trash` → refresh 消失 | asset-detail-panel.tsx:130-144(data-slot 还叫 asset-action-rename);assets-interactive-region.tsx:154-166 | works(危险:一击即删、无确认、无任何回收站/恢复 UI,`assets.restore` op 存在但前端零引用,grep 证实) |
| 13 | 详情面板 · 附到项目(select + 按钮) | 选项目 → `materialLinks.create { role:"clip", stage:"production" }` → refresh → 使用记录出现一行 | asset-attach-to-project.tsx:80-93 → assets-interactive-region.tsx:171-189 → contract materialLinks.create(material-links.ts:22) | works(未真机触发;链路完整)。select 实测渲染 139 个 option,不可搜索,见 D-9 |
| 14 | 详情面板 · 使用记录列表 | 展示该素材被哪些项目引用 | `assets.usage.list`(按 assetId 反查用料链)+ projects.list 解析标题(assets-data.ts:165-201) | works(真机:6 个种子素材全部返回 [],面板显示诚实空态「尚未被项目引用。」) |
| 15 | 元数据 / 标签区 | 展示 | mimeType/大小/尺寸/时长与 tags 均来自 **canonicalDataset fixture 查表**(selectors/assets.ts:79-103),非 DB | works(展示);数据桶=fixture,真上传素材会显示 0 B,见 D-6 |
| 16 | 空态(空库/筛选无结果) | 渲染 0 张卡 + 「共 0 个素材」;**无任何空态文案/CTA** | 真机验证:?q=zzz_no_match_zzz → cards:0,无"无结果/暂无素材"字样 | works 但体验差,见 D-7 |

死按钮/断链:未发现纯死按钮(Plan D1 已清理过 5 个装饰筛选 chips/批量操作/视图切换/排序,assets-interactive-region.tsx:250-261 注释有账)。当前最接近"点了没反应"的是 #9 下载(有状态行但极小)与 #2 上传(疑似静默失败)。

---

## 3. 数据来源(数据 | 来源链 | 真伪桶)

| 数据 | 来源链 | 真伪桶 |
|---|---|---|
| 素材列表(6 条) | page.tsx → buildAssetsViewModelReal → `assets.list`(page:1,pageSize:200)→ assets.transport → repo(pglite/PG assets 表)→ 表内容 = canonicalDataset.assets 种子(persistence-client.ts:4104 seedAssets) | **real 读 × fixture 内容**(真库真 op,但 6 行全是 canonical 种子;真机 curl 验证 ids: asset-audio-1/asset-broll-1/…) |
| 素材文件元数据(格式/大小/尺寸/时长) | selectors/assets.ts:79-97 用 currentFileId 查 **canonicalDataset.assetFiles(前端 fixture 常量)**,查不到回退 0 B / octet-stream;DB 里的 asset_files 真表存在但 assets.list 不 join、契约也无读 file 的 op | **fixture**(种子素材恰好能查到;真上传素材必查不到 → 0 B) |
| 标签 | selectors/assets.ts:84-87 查 canonicalDataset.entityTags/tags(fixture);无任何 tags op | **fixture**(真素材永远无标签) |
| 类型计数 | deriveGallery 对真读行现算(assets-page.tsx:236-240) | real(派生) |
| 使用记录(用料历史) | 每素材一次 `assets.usage.list`(N+1)→ material_links 表;projectTitle 由 projects.list 映射 | real(真机验证当前全空) |
| 附到项目 picker(139 项) | `projects.list`(请求 pageSize:100)→ 返回全部 139(op 无视分页,见 B-3) | real(含 douyin-real 导入的 dy-proj-*) |
| 存储「已用 0.07 GB」 | 前端 Σ 已读行 fileSizeBytes(assets-data.ts:272-275)——实质 = Σ canonical 种子文件大小 | 弱真(聚合真行,但行内 size 来自 fixture 查表) |
| 存储「/ 50 GB」总额度 | fixtures selectors buildAssetsViewModel 常量 50GB(selectors/assets.ts:196-198);代码注释称"QUOTA 无 op" —— **claim 已过期**:`settings.storage.get` 真 op 存在且真机返回 usedBytes:78528512 + totalBytes:494384795648(真 statfs 磁盘容量)+ 分类型 breakdown | **hardcoded**(且有现成真 op 未用) |
| 全局 Sidebar「12.4 / 50 GB · 自动同步已开启」 | sidebar.tsx:272-286 字面量 | **hardcoded**(纯假,与页内卡同屏矛盾) |
| 缩略图 | thumbnailToken = FNV hash → 程序化 SVG(media-preview.tsx),**从不加载真字节** | hardcoded/派生(spec ASSET-05 已列【修】) |
| 下载/复制链接产物 | mock:// 占位 + 状态行"规划中" | planned(诚实占位) |
| 空态 VM(读失败)typeCounts | emptyAssetsViewModel 复用 fixture typeCounts(assets-data.ts:135-148) | fixture(error 分支早退未渲染,暂无害) |

---

## 4. 数据流向(写路径)

1. **上传**:`assets.uploads.create`(建 upload session + local-fs 预写 sidecar 元数据)→ [应当] PUT 字节到 `/api/v1/blob/<key>?token=`(route.ts:86 有 PUT handler)→ `assets.uploads.complete`(headObject 校验 → insertAsset + insertAssetFile + currentFileId 指针)。**前端环节疑似断裂**(B-1)。
2. **收藏**:`assets.favorite.toggle` → assets 表 isFavorite 翻转(持久化)。→ 但无任何读侧消费。
3. **回收**:`assets.trash` → status:"deleted" → 从 active 列表消失。`assets.restore` op 存在,前端无入口 → 单向门。
4. **附到项目**:`materialLinks.create { projectId, entityType:"asset", entityId, role:"clip", stage:"production" }` → material_links 表 → refresh 后经 `assets.usage.list` 反查回显为使用记录。role/stage 前端写死。
5. 本页不触发 AI 任务、不触发采集。

---

## 5. 与宪法对照

- §8「不做视频编辑器」:✅ 无剪辑/时间线/播放器;下载/复制诚实规划中。
- §8「不分视频类型」:✅ 类型仅按文件媒体类型(image/video/audio/document/subtitle),无内容类型分类。
- §7「数据底座替换所有 mock/seed」:❌ 本页素材 100% canonical 种子;139 个真实导入项目零素材关联(真机 curl:assets.list total 6 全 seed;usage 全空)。
- §5.3「AI 只产候选」:N/A(本页无 AI 入口 —— 制作阶段的 material.match 在项目工作台,不在此页,入口分工合理)。

---

## 6. 设计不合理

| # | 问题 | 严重度 | 建议 |
|---|---|---|---|
| D-1 | **同屏两张存储卡且互相矛盾**:全局 Sidebar 硬编码「12.4 / 50 GB · 自动同步已开启」(sidebar.tsx:272-286) vs 页内卡「0.07 GB / 50 GB · 个人本地素材库」。ASSET-17 只修了页内卡的假文案,Sidebar 同款假文案漏网 | 高 | Sidebar storage variant 接 `settings.storage.get`(真 op 已存在),或直接删掉该 contextual 卡,避免双卡 |
| D-2 | **「更多」按钮 = 一击移入回收站**:三点图标语义是"更多菜单",实际直接 `assets.trash`,无确认、无 Toast 撤销、全站无回收站/恢复入口(assets.restore 前端零引用);data-slot 还叫 `asset-action-rename` | 高 | 改为真菜单(重命名/移入回收站),trash 加确认或可撤销;补回收站视图(spec ASSET-14 也建议) |
| D-3 | **收藏是"只写"功能**:isFavorite 持久化了,但 AssetSummary 不含 isFavorite(assets-page.tsx:132-145 无此字段),卡片/详情无收藏态标识、无收藏筛选(Plan D1 删了"我的收藏"行) —— 用户点了收藏,全 UI 找不到任何痕迹,再点一次才知道翻转了 | 高 | summary 透传 isFavorite;星标点亮 + 窄栏加「收藏」筛选行 |
| D-4 | 下载/复制链接按钮本体无「规划中」标识,只靠面板下方 11px aria-live 状态行事后解释;复制链接还真把 `mock://` 假串写进剪贴板 | 中 | 按钮加 badge/disabled+tooltip;或直接落地 spec ASSET-12/13(service 已有 getSignedUrl 能力,local-fs 有 token GET URL) |
| D-5 | 素材库缩略图全部是 hash 派生的抽象 SVG,永不加载真实图像/视频帧 —— 图库不"看图",挑素材只能靠文件名 | 高 | spec ASSET-05 已列【修】:image/video 用 signed GET URL 真缩略图 |
| D-6 | **真数据走 fixture 查表**:列表行的文件元数据/标签从 canonicalDataset 前端常量解析(selectors/assets.ts:79-103)。任何真上传素材会显示「0 B · application/octet-stream · 无标签」,且存储已用不增长 —— DB 里明明有真 asset_files 行 | 高 | assets.list join asset_files(或契约加 files 读 op),砍掉 canonical 查表路径 |
| D-7 | 空态零处理:空库/筛选无结果均为"0 张卡 + 共 0 个素材",无文案无 CTA(真机验证 ?q=zzz 无任何提示语) | 中 | 空库给「上传第一个素材」CTA;无结果给「无匹配,清除筛选」 |
| D-8 | 存储卡「50 GB」总额度是 fixture 常量,而 `settings.storage.get` 真 op 已返回真磁盘容量(真机 460 GB)+ 分类型用量;assets-data.ts:36-37「QUOTA 无 op」注释过期 | 中 | 页内存储卡改读 settings.storage.get,与设置页同源 |
| D-9 | 附到项目 = 139 个 option 的原生 select,不可搜索不可分组;role/stage 写死 "clip/production";materialLinks.delete 存在但无解绑 UI(附错了删不掉) | 中 | 可搜索 combobox;attach 后使用记录行加"移除"入口 |
| D-10 | 使用记录只显示项目名+日期,note(role · stage)算了不渲染(assets-data.ts:190 生成,asset-detail-panel.tsx:225-238 未用);且无点穿到项目的链接 | 低 | 渲染 note、项目名做成 Link |
| D-11 | 用料历史 N+1:每次 SSR 对每个素材各发一次 assets.usage.list(6 素材=6 次;200 素材=200 次)(assets-data.ts:173-194) | 中(规模隐患) | 后端加按 userId 批量反查 op |
| D-12 | local-fs sidecar 预写假尺寸:任何 image/video 记 1920×1080、video/audio 时长记 1000ms(localfs-object-storage.ts:88-95 自注"placeholder") | 低 | 真探测或置 null(UI 已支持 null 隐藏) |
| D-13 | **素材中心与飞轮断连**:139 个真实作品项目无任何素材/封面/成片落库;research 的「帮我搜素材」落的是 knowledge 不是 assets;ingestion 的 registerExternalAsset 端口存在(persistence-client.ts:1250)但 douyin 导入未用它落素材 | 高(产品层) | 导入管线把封面/成片注册为 asset 并建用料链,素材中心才成为"真实记忆"的一部分 |
| D-14 | 布局范式不一致:素材中心整页流式滚动,工作台类页面是固定高度独立框滚(page-binding-spec INV-05 自己列为统一项) | 低 | 按 INV-05 统一 |

---

## 7. 疑似 Bug

| # | 描述 | 证据 | 严重度 |
|---|---|---|---|
| B-1 | **默认配置(local 后端)下上传素材疑似整链失败且静默**:① settings 默认 backend="local"(settings.service.ts:379,真机 settings.storage.get 返回 backend:"local");② local-fs 的 uploadUrl 是**相对路径** `/api/v1/blob/<key>?exp&token`(persistence-client.ts:1122 publicBaseUrl:"/api/v1/blob";localfs-object-storage.ts:66,101);③ 前端只对 `^https?://` 的 URL 才 PUT 字节(asset-upload-button.tsx:67),相对 URL 被跳过;④ createPresignedUpload 只写 sidecar 不写主文件(localfs-object-storage.ts:81-102);⑤ completeUpload → headObject → `fs.stat(absKey)` 对不存在的主文件抛 ENOENT(localfs-object-storage.ts:126),service 无捕获(assets.service.ts:171);⑥ 前端 handler 无 catch,startTransition 内异常吞掉 → 无任何 UI 反馈。旁证:媒体根 /Users/zyongzhu/CreatorOS/media 为空目录(从未有成功上传)。page-binding-spec ASSET-16 判定"运行态真"与代码链路矛盾。**未真机触发(审计禁写);链路为静态推断** | asset-upload-button.tsx:67;localfs-object-storage.ts:66,81-102,126;assets.service.ts:171;settings.service.ts:379 | 高 |
| B-2 | **assets.list 后端分页坏**:transport 收 page 参数但从不使用(cursor 恒 null),total=返回切片长度而非全量。真机验证:page=1&pageSize=2 与 page=2&pageSize=2 返回**同样的** [asset-audio-1, asset-broll-1],meta.total=2(实际 6)。前端靠"一次读 200 + 客户端切片"掩盖,但 page.tsx:10-13 与 assets-interactive-region.tsx:318-320 注释宣称「REAL paging」名不副实;素材 >200 条时静默丢失 | assets.transport.ts:114-128;curl 复现见上 | 高 |
| B-3 | **projects.list 无视 pageSize**:请求 pageSize:5 → 返回 139 行,meta.pageSize 回显 50。附到项目 picker 因此"意外完整",但 op 契约行为错误(分页参数是摆设、meta 撒谎) | 真机 curl:data len 139 / meta.pageSize 50;(op 属项目组,此处越页记录) | 中 |
| B-4 | Sidebar「自动同步已开启」为无依据假声明(页内同文案已按 ASSET-17 删除,shell 层残留),配合假 12.4GB 直接误导用户对数据安全的判断 | sidebar.tsx:286 | 中 |
| B-5 | 真上传素材(若 B-1 修复后)在列表中显示 0 B / application/octet-stream、存储已用不涨 —— 前端把 DB 真值旁路成 canonical fixture 查表 | selectors/assets.ts:79-97(filesById 只含 canonicalDataset.assetFiles) | 高(被 B-1 掩盖) |

---

## 8. 待对齐点(与宪法/其他页面)

1. **存储数字三个真相**:Sidebar 硬编码 12.4/50GB vs 页内弱真 0.07/50GB vs settings.storage.get 真值 0.073GB/460GB。设置页若显示真值,则三处口径互相矛盾;命名也不一(「素材库存储」vs「存储空间」)。
2. **seed 清退进度不一**:项目列表已清 demo 假项目(BACKLOG #96),复盘/发布中心接了真数据,素材中心仍是 6 条 canonical 种子 —— 跨页"真实度"落差,用户会觉得"这页是假的"。
3. **分页语义不一致**:项目页真分页 10/页;素材页 URL 分页实为前端切片(cap 200);两个 list op 的后端分页一个坏(assets)一个摆设(projects)。契约 paginationQuery(page/pageSize)与 repo 实现(cursor/limit)两套模型没对齐。
4. **收藏语义跨页不一致**:素材收藏持久化但不可见;知识库/选题等页的收藏/星标若有可见态,则同一动词行为不同。
5. **「附到项目」的 stage 语义**:写死 stage:"production" 与七步阶段机(brief/research/planning/script/production/publishing/review)耦合 —— 若未来从研究阶段附素材,stage 仍记 production,用料链阶段数据失真。
6. **spec 与代码判定漂移**:page-binding-spec §7 ASSET-16 判"运行态真",与 B-1 链路矛盾;ASSET-17 的修复只落了一半(页内改了、Sidebar 没改)。spec 的判定表需要按本审计回填。
7. **素材来源单一**:宪法数据底座要求真实创作历史成为"来源库",但 ingestion 的 registerExternalAsset 端口未被 douyin 导入使用,素材中心游离于飞轮之外。
