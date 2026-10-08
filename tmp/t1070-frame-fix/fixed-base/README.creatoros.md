# 官方 OpenCut 完整编辑工作台的 CreatorOS 集成包

原仓库：https://github.com/OpenCut-app/opencut-classic
固定提交：`cf5e79e919144200294fb9fed22a222592a0aeea`（已归档上游）。完整素材区、预览、属性区、时间轴及其命令/撤销/渲染仍来自原实现。

## 集成接口

父页面与 iframe 必须同源；`iframe.src = '<静态目录>/index.html#/?session=<随机会话>'`。帧只接受 `event.source === parent`、精确同源、相同 session 的消息。

消息外形：`{type:'creatoros.reference-editor',version:1,session,requestId,operation,payload}`。操作：
- `load`：`{document:nativeProject|null,title,outputId,media:[{mediaId,file:File,name,type:'video'|'image'|'audio',...原生元信息}]}`；原生文档为版本31，文档 metadata.id 必须等于 outputId。不转换旧 CreatorOS 工程。
- `snapshot`：回 `result`，payload 为 `{operation:'snapshot',document,mediaMetadata}`，不含 File/Blob/对象URL或临时缩略图。文档保持原生工程结构；父稿面负责显示、保存及原 Production CAS。
- `insert-media`：`{mediaId,file:File}`；真实已保存素材加入左侧素材区，由用户点击素材卡片的加号或拖入时间轴（双击仅选中），不自动做编排。
- `export`：可选 `{format:'mp4'|'webm'}`；原 MediaBunny/WebCodecs 导出后回 `{operation:'export',document,mediaMetadata,blob:Blob,fileName}`，document 与 mediaMetadata 来自本次渲染实际使用的同一冻结快照；导出时编辑输入被锁定，尚未完成的素材导入不可回写，结束或失败后恢复编辑。父稿面用同次回包的稿件做 CAS，再接既有作品成果服务并下载。

帧发送 `ready`、`changed`；请求结果为 `result`，失败为 `error`，payload 内包含原 operation 和 message。原上传、粘贴文件先发送 `import-media` 的 `{file:File}`，父稿面必须完成真实上传和作品归属后同 requestId 回 `result` 的 `{operation:'import-media',mediaId}`，或者 error。原编辑素材只能使用回执中的真实ID；文件只保留于当前帧内存。

帧无 IndexedDB/OPFS 项目权或资产权，原自动保存只更新内存；载入建立原生结构基线，只有实际工程/素材元信息变化才通知 changed，忽略自动保存的 metadata.updatedAt/scene.updatedAt 和临时运行字段；离开、版本冲突或失败后恢复属于父稿面。不会从 iframe 直接访问 CreatorOS 数据库、任务或模型。

## 可复建步骤

使用 Bun1.4.0（首次安装实测）/Node25.9.0，可用默认公开 npm registry。source archive 排除 node_modules、环境文件、服务器/认证页面、analytics及测试harness。原始完整 source 链接与提交保留。

```bash
bun install --frozen-lockfile --ignore-scripts
cd apps/web
bun ../../node_modules/vite/bin/vite.js build --config vite.embedded.config.ts
bun ../../node_modules/typescript/bin/tsc --noEmit --project tsconfig.embedded.json
cd ../..
bun test apps/web/src/embedded/__tests__/host-boundary.test.ts
```

产物 `apps/web/embedded-dist`。发布目录保留 LICENSE.opencut、THIRD_PARTY_LICENSES.json/txt；src 中的源码与所有依赖须能重建、替换。Vite 的 build 不启用 Next全站或其外部遥测。

## 许可与对应源

OpenCut 为 MIT；实际 bundle 的72项依赖清单来自 Rollup 最终渲染模块，见 THIRD_PARTY_LICENSES.json。不能把整个产物称为 MIT。

- MediaBunny `1.41.0` 为 MPL-2.0。官方 tag `v1.41.0`，提交 `b285360563b754546cbfb7bbcf853f107e1dd3b9`。本机发布包 src 的57个文件与该 tag 字节完全一致。纯对应源 archive（约1.5MB）保留全部 src、原构建脚本、锁与许可证及构建所需 packages 文件，只移除测试/演示二进制媒体；没有修改该库。
- SoundTouchJS `0.3.0` 为 LGPL-2.1。官方 tag `v0.3.0`，提交 `36b161bb7d69d801b6a81674ad0fc0c42082729f`。本机发布包 sourcemap 的13份源码与该 tag 字节完全一致。对应源 archive 包括 src、原构建脚本、锁与许可证；没有重写或修改该库。
- 主编辑器源、构建配置及锁一并交付，可通过包解析/别名替换库再重建独立编辑器。CreatorOS宿主只通过消息使用独立工作台。
- 开源、MPL、LGPL许可证文本与原仓链接均保留；提供对应源是本次技术准备，不等于已经取得法律审核。对外发行须确认发布页同时可获取源码/许可证，不能在终端用户条款中禁止这部分许可允许的修改与调试。
- 13项 permissive 依赖 npm 包未带独立 LICENSE 文件，清单保留其原 package.json 声明和仓库信息；没有捏造额外许可。

本次不下载、打包 Google 字体二进制或其预览图；只展示浏览器系统字体，默认 Arial。原站未实现收藏/我的字体页及云音效、贴纸搜索、未来占位工具在嵌入稿面隐藏。效果预览图片源自固定上游 public/effects/preview.jpg，未新增第三方图。完整来源与素材来源仍应随源码保留。

## 实测边界

原全站 Next 生产 build 暴露上游缺失的协议守卫与旧API参数，不能记为 PASS。嵌入修复 isShortcutKey、isActionWithOptionalArgs、StickerRegistry 参数三个上游协议问题；并将保存吞错改成可传播的错误。原生静态嵌入 build /依赖图 typecheck 通过，宿主桥边界及冻结一致性及变更通知5项39断言通过。真实界面导入、剪辑、重载与 MP4 导出由主会话 CUA 实测，不以此文档代替。

素材、导入、文字、内容、默认文字及空属性提示已中文化。原素材工具栏在素材区宽度不超过260px时隐藏辅助视图/排序图标，保证真实导入按钮完整可见，较宽区域保留原操作；未重建原四区工作台。

重建确定性：Tailwind 只扫描完整 src（source(none) + @source），不会扫描上一次 embedded-dist。此前旧包重复构建包含额外 utility，虽原生 JS 仅 CSS 引用文件名不同，但旧静态包与清洁重建不逐字节相同。现在用清洁与重复构建对比记录实际稳定产物，不把旧校验当作位复现证据。

本次在已有dist、连续重复构建、独立目录清洁构建三种条件下，Vite生成的8份文件名与字节相同（同一已安装锁依赖树）；记录见 REBUILD_CONSISTENCY.json。另有主会话从源归档 fresh --frozen-lockfile 安装所得相同 JS/CSS 文件名与字节证据。未声称跨操作系统/不同工具链的全局位复现。


## T-1046：同工程 AI 粗剪的原生消息

`context` 返回持久化 snapshot 加 `outputId/sceneId/trackId/selectedElements/playheadTick/ticksPerSecond`；`seek` 接收确切 owner、scene 和 120000 ticks/s 的 `tick`。
`apply-tracks` 接收 `{outputId,sceneId,expectedBeforeDigest,beforeTracks,afterTracks}`。before 必须是完整目标 scene 的 main/overlay/audio 持久化 JSON，包含未知字段；Digest 为排序键 JSON 的 SHA-256。owner/scene/before/digest 不符返回 typed 409，零写入。采纳只执行一次 scene-aware NativeTracksSnapshotCommand，保留真实 Undo/Redo、其他 scene 后来修改、选区与播放头；已由服务闭合的窗口不再二次 ripple。
同 requestId 和完整输入的 apply 回执保留当前 iframe 会话全程，不受普通 100 条回执淘汰；Undo 后同 ID 重播仅返回原 ACK。同 ID 更换输入拒绝。源媒体临时 File/URL/AudioBuffer 仅在帧内保留，不进入持久化证明。

实测：本包 Bun 两个真实存储/Core测试入口合计 10 项、63 assertions PASS；嵌入 source TypeScript 和 Vite 构建 PASS。独立反例还覆盖并发同 ID、audio 未知字段、Undo 后重播及跨场景修改。真实视频导入、ASR供应商和界面尺寸验收由主会话完成，不能以本包自动化代替。
