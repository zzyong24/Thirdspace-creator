# 完整开源工作台窄适配合同独立复核

结论：**PASS（合同复核）**。本次只审核 `adapter-contract.md` 的接入边界，未记录 SPEC receipt，也不代表源码实现、浏览器编辑或导出验收已经通过。

原编辑器负责用户能看见、能操作的播放器、时间轴或图层画布。CreatorOS 父页面沿现有接口保存稿件和素材，后端仍检查具体账号、作品和版本。这个切分可以直接复用完整工作面，同时避免增加第二套业务项目与素材库。

```mermaid
flowchart LR
 A[原生编辑器完整工作面] -->|当前文档与明确素材ID| B[CreatorOS 父稿面]
 B -->|原公共接口| C[现有作品版本与素材服务]
 C -->|确切文件与版本| B
 B -->|重建本次临时工程| A
```

## 复核范围与证据

- **完整 UI 的复用范围明确**：OpenCut Classic 完整四区和快图设计完整三栏作为静态前端集成；不改写其编辑内核，不部署参考工程后台。临时内存替代参考工程的项目持久化，正式保存通过 CreatorOS 原服务。
- **归属和并发边界保持**：图文设计保存进入原 GraphicPostDocument 与 createGraphicPostVersion CAS；视频原生工程进入原 Production owner/版本/CAS。父稿面决定真实 output，frame 不获得业务账号 token。媒体采用真实 assetId/assetFileId，新增引用继续走原权限校验。
- **原工程保留与切换明确**：v3 原生工程通过用户明确 replaceEditor 选择新版本，不允许常规旧编辑器保存覆盖；未知原生字段原样保存，不以不能保真转换为由置空旧稿。旧方案继续从正式历史恢复后沿原链使用。
- **媒体恢复与交付区分明确**：File/Blob/objectURL 不写入正式文档，恢复时按冻结 assetFileId 取确切文件；图文导出 PNG 进入原 Asset 并绑定 cover/cardId；视频使用本地 SceneExporter，下载和上传成品采纳分别表达。未把单独参考工程启动或本地下载视为已关联具体作品。
- **消息和晚回复边界明确**：同源、确切 source/window、挂载 session、requestId 与协议版本联合校验；作用域变更重挂载、旧 session 回复丢弃。未知消息不保存。

源码核对包括：`contract/src/resources/graphic-posts.ts` 当前严格 GraphicPostDocument；`backend/src/modules/graphic-posts/graphic-posts.service.ts` 的 assertDocument；`backend/src/modules/production/production.service.ts` 的 getEditor/saveEditor/restoreEditor/renderEditor；官方参考工程 `apps/web/src/services/renderer/scene-exporter.ts`。当前源码尚未具备新增 designs 或 v3，因此本结论只覆盖拟实施合同。

## 实现复核必须核实的合同落实点

以下属于本合同既有要求的具体落点，不增加范围或额外 Gate：

1. v3 不能仅进入 saveEditor：getEditor 的状态识别、历史读回/明确恢复、旧提交入口与 preview/render 必须一致识别它；HyperFrames 不受理 v3 时返回明确可继续的提示，不创建任务。旧 v1/v2 的成功样例继续通过。
2. 原生文档中的媒体引用与 mediaRefs 必须实际对应。新增/替换校验不能只检查 mediaRefs 列表而漏掉 JSON 内的未登记真实引用；图文内嵌图片 src、视频 mediaId 均须恢复到同一 assetFileId，不能改读 currentFileId。
3. 导出发生时使用实际当前编辑快照。异步 PNG 导出完成后的 CAS 保存要携带导出对应的原生 JSON，避免等待导出期间的新编辑被旧图片回包覆盖；失败保留本地输入。视频须实测包含可见片段、字幕和音频的 MP4，SceneExporter 存在于源码不等于目标浏览器已成功编码。

没有发现需要更换候选、重建编辑内核、增加数据库或重新拆解产品范围的阻断问题。
