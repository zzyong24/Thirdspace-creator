# T-1402 无感升级本地验证

2026-10-23。本次验收对象为桌面正常启动自动升级及设置页局部状态联动。当前仅记录实际完成的本地受控验证；打包、安装、冷启动与钱包复核另留外部真实运行工件，不以单元测试代替。

## 已完成

- 后端升级服务及路由：原完整测试70通过/16失败后86/86通过；相邻4文件188/188通过，原断言保留。
- 客户端协调器和启动入口：最终6文件98/98通过；涵盖重挂共用、scope隔离、原生未知禁止同步和普通渠道兼容。
- 设置页：首次无感入口失败、旧not_configured页面失败；独审又发现同组筛选误清错误/取消在途，2失败/12通过后修复；最终两整文件132/132通过。
- 模型区域：旧SSR与新官方路由联动真实4失败/15通过后19/19通过。旧完整模型卡保留；其它scope/来源/能力不误显示官方就绪。
- workspace typecheck：NODE_OPTIONS=--max-old-space-size=6144，workspace并发1，exit0；末次源修改后frontend同堆类型检查exit0。
- quality.test.mjs 17/17；LED-047原8文件189/189；既有DTO/routing/额度链接/workspace回归4文件75/75。
- 最终timeout-policy和boundary均exit0，boundary仍有5条既有基线，无新增。
- 最终设置实现及新专属测试ESLint exit0；本次新增与修改文件内容gitleaks redacted扫描exit0、0发现。后续冻结提交仍须完成完整打包预检。

## 限制与原始证据

- 全局只读quick reconcile实际exit1：22错误、17警告；均为既有其它任务review回执/看板health，未将它写成全绿，也不扩大本任务去归档其它任务。
- 既有settings-interactive-region.test.tsx全文件ESLint存在6个no-explicit-any错误及1警告；已用HEAD原件stdin复现相同结果。不得把局部lint通过描述为全仓lint通过。
- settings-model-region.tsx全文件ESLint另有1个既有set-state-in-effect；作者用HEAD原件经相同stdin命令复现exit1，原helper逐字未动，未添加豁免。新专属区域测试无新增lint问题。
- 测试PGLite目录均隔离，未用于恢复真实许可、重绑或赠额。生产Activity本轮未再次变更。
- 原始日志、exit码、冻结源摘要在 `/Users/zyongzhu/terminals/growth-credit-20261023/t1402/automatic-upgrade/`；server、client、region子目录保留RED/GREEN与清单。settings-scope-red/green、typecheck-frontend-final、timeout-policy-final、boundary-final为末次源回执。
- 本机18:56的按钮恢复与Growth22/22复核是前一阶段证据：本次自动安装必须重新观察自然启动，禁止再手动恢复或补赠来冒充自动完成。
