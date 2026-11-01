# 2026-11-01 官网更新日志来源核对（T-1434）

## 版本与日期

- 真实线上 HTML：`https://creatoros.aitongban.cloud/`，2026-11-01 经 SSH 回读 `/var/www/creatoros/index.html`。线上 CR-1.5 日志至 v1.1，顶部另有 e3151ce89 的 1.2.0 Mac 验收下载区。本次从线上页面保全后修改，不用仓库 CR-1.4 覆盖线上既有内容。
- GitHub `GET /repos/zzyong24/Thirdspace-creator/releases?per_page=20` 返回空数组，不据此编造公开 Release。
- `frontend/package.json` 与 `frontend/src-tauri/tauri.conf.json` 当前均为 1.2.0；提交 `27f88e24b` 在 2026-09-13 升级版本。`docs/features/t973-release-1.2.md` 与 `docs/research/evidence/t974/release-verification.json` 记录双端构建和安装验证，明确未创建公开 Release、未改变自动更新源。
- 九月批次按 2026-09-01—09-15 的源码更新归档；十月批次按 2026-10-01—10-29 归档。二者均属 1.2.0，页面明确安装版本口径，不代表所有平台安装包同步覆盖最新源码。
- 既有 v1.1、v1.0、v0.3.0、v0.2.0、v0.1.0 记录与用户已确认日期保留。历史日期依据 `docs/marketing/CreatorOS-v1.0-产品功能与版本迭代图.md`，不重新推导 tag 日期。

## 十月变化与依据

| 官网描述 | 来源 |
|---|---|
| 三种创作统一入口 | `docs/features/t1043-unified-creation-content-conversion.md` 与当前已实现工作台；不宣传该 SPEC 尚待验的全部互转能力 |
| 先确认脚本再生成文章/图文 | `711f339cf`，2026-10-29 |
| 免抖音登录生成定位候选，手工采纳 | `de8bc008e` / PR #12，2026-10-27；不宣称缺失完整 CI 已通过 |
| Mac 图文设置与配文编辑 | `22a63ff2a`，2026-10-28；不宣称整项 AI 图片与导出验收完成 |
| 先保存主页、公开页面转写 | `24d5f3232`，2026-10-28 |
| 保存权限与导出阻塞修复 | `3a0d8ac63`、`1a7ca9426`，2026-10-26 |
| 页面、总览与标签切换响应 | `0c2877020`、`cfd165baa`，2026-10-24—26 |
| 保留未知提交、真实预览状态 | `840af5eca`，2026-10-28 |

## 九月变化与依据

| 官网描述 | 来源 |
|---|---|
| 独立运营分析、日期范围 | `52605e04b`、`e3df3bf21`、`53ce5d56c`，2026-09-13 |
| 真实分享战报、CSV | `d915c5d2f`、`ed5e9be6b`、`9287c1b8d`，2026-09-13 |
| 拆分采集、逐批反馈 | `662641110`、`380e85f74`，2026-09-14 |
| 北京时间错峰、防重复 | `d651160f4`、`feea72d6b`、`5ebb50915`、`13fe7de6e`，2026-09-14 |
| 封面恢复、冷却后转写续跑 | `b3fc63aee`、`c07750604`、`81102ec57`、`826de11c5`，2026-09-08—14 |
| 雷达筛选排序、项目直达 | `865cdfce3`，2026-09-08 |
| 助手、首页与常用页面响应 | `d58344402`、`169901655`、`af62ddda7`、`1cb73db64`，2026-09-13—14 |
| 双端构建及安装启动修复 | T-973/T-974 的真实 CI 与本机记录；不将 T-990 的单端成功说成双端通过 |

## 保全与发布

只替换 `/var/www/creatoros/index.html`，部署前保存服务端备份。`updates/`、`prompts/`、安装包与 nginx 配置均不改。GitHub 查询与线上核对是只读操作，没有发布 GitHub Release 或推送源码。

## 首次上线后用户明确更正（2026-11-01）

用户要求“不要命名为9月10月吧，命名为1.2.0、1.3.0”，并指出遗漏多平台支持。该明确命名取代上文按月份区分批次的初次实现，官网最新记录采用1.3.0，前一批采用1.2.0；不据此声称已生成1.3.0安装包。

多平台来源：`frontend/src/features/projects/work-type-fields.tsx` 的文章/图文/视频与小红书、抖音、快手、公众号目标；`contract/src/primitives.ts`、`frontend/src/lib/platform-icons.ts` 与 `backend/src/modules/publishing/publishing.service.ts` 的抖音、小红书、视频号、公众号、快手、B站、YouTube 等发布管理平台；`backend/src/modules/platform-collection/platform-collection.service.ts` 按真实适配和授权状态提供采集能力。官网统一描述多平台创作、发布管理与运营，按连接状态说明发布和采集可用性，不把枚举中的平台视为全功能自动发布验收。
