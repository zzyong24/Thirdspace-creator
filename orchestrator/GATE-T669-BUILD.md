# T-669 BUILD Gate

## 结果

- 旧信源分享文案 URL：PASS
- 无效旧信源隔离且工作区继续加载：PASS
- 封面回填默认小批量 10：PASS
- 网关长冷却立即止损并诚实 deferred：PASS
- Node 25 类型检查：PASS
- 架构边界：PASS（无新增违规，5 条既有基线）
- Next.js 生产构建：PASS
- 双平台流水线：PASS
- macOS 真启动与主页面加载冒烟：PASS
- Windows 原生安装、真启动主页面与主动卸载清理冒烟：PASS

## 当场证据

```text
backend intelligence.service.test.ts: 23 passed
frontend douyin-cover-backfill.test.ts + douyin-heavy-backfill.test.ts: 21 passed
backend typecheck: PASS
frontend typecheck: PASS
boundary-scan: PASS（无新增违规）
frontend next build: PASS（Node v25.9.0）
```

## 双端安装包

- GitHub Actions：[desktop-release #30786063714](https://github.com/zzyong24/Thirdspace-creator/actions/runs/30786063714)（`success`）
- 构建提交：`ba15f09bbc1223118d2a17324d87d5018c0eb6d0`
- macOS：`CreatorOS_0.2.1-beta.3_aarch64.dmg`，本地 426 MiB，SHA-256 `2c7a16908c2eb2e453fa2016794f073564fb32368da01532739bce254547ece8`
- Windows：`CreatorOS_0.2.1-beta.3_x64-setup.exe`，本地 1.0 GiB，SHA-256 `fec42603f4ace8e5daedf01169c39b16aac9c88e5c66fa4f996062243c5c6d4b`
- 本地目录：`/Users/zyongzhu/Downloads/CreatorOS-30786063714`

## 全仓既有测试债（不冒充全绿）

全量前端测试仍有近期可见文案改名后的旧断言失败，例如测试寻找“搜素材 / 上传素材 / 联网搜到素材”，当前 UI 已显示“联网找资料 / 上传·管理素材 / 联网找到资料”。这些失败与 T-669 采集后端、旧数据迁移和封面 runner 无调用路径重叠，本任务聚焦 Gate 与生产构建均已通过；后续应由对应 UI 任务同步测试文案。
