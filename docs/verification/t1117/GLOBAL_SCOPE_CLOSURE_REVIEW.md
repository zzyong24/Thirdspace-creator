# T1117 系列全局范围限定收尾复核

结论：**PASS_LIMITED_SCOPE_CLOSURE_WITH_41_RETAINED_GLOBAL_ERRORS**。可以仅关闭 T1117、T1119、T1120、T1122 的已验范围，完成 T1121 的诊断任务，并恢复 T1108 当前冻结前端验收。完整 reconcile 仍为 exit 1，41 条既有错误必须继续保留。

## 全局对账事实

规范环境完整 reconcile 于 2026-10-09T11:44:20Z 结束：1498.420231 秒、exit 1、41 ERROR / 0 warning，日志 SHA `bf20c0f903ee7449fb654033fa8b134ff44198027843196f783923b21a9f01bd`。逐行比较表证明当前 41 条与 `docs/verification/t1115/global-comparison.json#retainedErrors` 完全相同，`added=[]`、`removed=[]`；LED052、LED027 均 PASS。因此它支持“本轮没有新增全局错误”，不支持“全局通过”。

## 可限定收尾

- **T1117**：冻结产品/测试、32 个组件测试、174 个 LED-047 测试、两条公共浏览器、normal/narrow 视觉与最终 typecheck 已闭合，可完成本任务限定范围。
- **T1119**：闭集 helper、原字节保存、生产/开发产物真实再生及最终原 typecheck 已闭合；写坏源头继续标 UNKNOWN，可完成环境维护任务。
- **T1120**：唯一 `domcontentloaded` 观察修正已由原两条 0 retry 旅程验证，可完成。
- **T1122**：两个视口的左缩略图和右预览均由加载断言及实际截图证明，可完成。
- **T1121**：额外 LED052 已定位为根验证环境用 55423，而原 runner 在 Vitest 前严格只准 55422。恢复规范 55422 后原 59 例通过，canonical reconcile 的 LED052 也通过；没有产品、测试或门卫修复。诊断任务可以完成。
- **T1108**：冻结报告与当前提交、公共旅程、截图、type 和全局无新增事实一致，可以恢复其当前冻结前端验收；仍不是安装或全功能验收。

两份 `FROZEN_FRONTEND_VALIDATION_REPORT` 的 `globalPassed` 边界与当前证据一致：它们明确写出完整对账 exit 1 / 41 ERROR、体验层未请求、真实供应商/扫码未覆盖，没有把局部 PASS 写成全局 PASS。

## T1123 与保留边界

T1123 原失败来自验证命令漏传正式 `--group`，业务 body 的 `_creatoros` 不能替代身份 header。显式 group 的纯组 `projects.list` 已 exit 0，产品未改；原失败继续保留。本报告只确认该诊断事实，不扩签其它项目操作。

仍不通过：41 条全局错误、T1118 raw 日志丢失 UNKNOWN、安装、真实扫码、真实模型、AI 联合候选、T1103 parser 和原生客户端人工体验。
