# 完整开源工作台集成

CreatorOS 视频采用 [OpenCut classic](https://github.com/OpenCut-app/opencut-classic)，图文采用 [快图](https://github.com/ikuaitu/vue-fabric-editor)。两者保留原编辑界面与引擎，以同源静态页嵌入；CreatorOS 原服务拥有作品版本、素材 exact file 与成果，没有增加独立云账号或作品数据库。

| 工作台 | 固定上游提交 | 许可及对应源 |
| --- | --- | --- |
| OpenCut classic | cf5e79e919144200294fb9fed22a222592a0aeea | 根 MIT；运行依赖含 MPL-2.0 MediaBunny、LGPL-2.1 SoundTouch。source.tar.gz、mediabunny-source.tar.gz、soundtouch-source.tar.gz 及静态包完整许可随包提供。 |
| 快图 | b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889 | 根 MIT；实际依赖按各自许可，清单/原声明保留。source.tar.gz 排除未授权中文 TTF 和云内容。 |

这部分开源组件按其原许可使用，CreatorOS 的专有限制不取代原许可。修改/替换依赖可在归档解压的完整构建项目中进行，然后重建独立工作台；不需要修改 CreatorOS 的数据库与宿主业务代码。

## 重建与校验

运行 `node frontend/scripts/build-reference-editors.mjs --verify` 核对源归档和静态包 SHA256。
运行 `node frontend/scripts/build-reference-editors.mjs --build kuaitu` 或 `--build opencut-classic` 在临时目录安装锁定依赖和重建，宿主使用新产物。更改源必须重新归档、更新 manifest、独立复核和浏览器验收，不能用旧 hash 声称通过。

快图需要 Node 与公开 pnpm8.15.9；OpenCut 需要 Bun，实测 Bun1.4.0。上游细节在各目录 README。程序不下载上游云素材；预览图来源保留于归档。工作台及 MPL/LGPL 对应源同时放在 frontend/public/reference-editors/sources，应用许可页可直接取得。

## 保存与导出

消息桥使用随机 session + 同源 + window source 三重检查。iframe 只持有当前编辑临时状态。导入先经原 Asset 上传/作品关联，再分配真实 mediaId。保存使用原作品 CAS 与幂等 requestId，完整原生 JSON 保留；旧剪辑方案仅明确确认后切换且保留历史。

导出返回同次冻结的工程/图层与文件，宿主用该稿保存。保存回执未知时复用冻结稿、已上传 exact file 与原请求，确认前保留重试入口。成片沿原 export/primaryAsset/发布登记服务采用，替换旧成片需明确确认。

实际集成证据见 docs/research/evidence/t1042/complete-editors。原生部分英文标签、不可读取旧素材恢复、完整助手编辑与客户端实包验收仍有待办，不把隔离测试视为全部产品体验通过。
