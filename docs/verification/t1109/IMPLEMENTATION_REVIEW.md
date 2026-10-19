# T-1109 实施独立复核

## 结论

**有限 PASS，findings 为空。** `verify.mjs` 的改动与已审 SPEC 完全一致：只给五个 Vitest 消费者显式增加 `--testTimeout=120000` 与 `--hookTimeout=120000`。没有修改测试源、产品期限、Node 探针、spawn 串行逻辑或退出码。

源码从 `be3ac0cba4c3c0b8300e8abaca9806058a9cedb655cde75b65f34ad0e725c85c` 变为 `7db6f10f79d91829fae56a2f902737bc4977462b39da5c01c8f50f15e40e0fae`。

## 实际证据

原三个 backend 文件在相同 `retry=0` 下增加规范预算后，实际 3 files / 35 tests / 0 skip / exit 0，日志 SHA `95e15a2aec6d6ad0d9eeaabd6d04fddad9f11f98d5846b9431f7006c596062ce`。这关闭了原 `beforeAll` 默认10秒导致25例全skip的问题。

完整 `node tools/timeout-policy/verify.mjs` 的日志 SHA `ca2e821165827c5aa0e131dd2d7406dc630ad1673d9c8ac7091b55d276ef73db`，实际显示所有 Vitest 命令收到两个120000参数：

- contract：5 PASS；
- ai-worker：20 PASS；
- backend：35 PASS、没有 skip；
- frontend：68 PASS；
- mcp-server：参数经 pnpm test 真实透传，27 PASS；
- Node 原生探针：5 PASS、0 skip。

完整 verify 仍诚实 exit 1，失败来自先执行的原静态 timeout-policy 检查；串行流程继续完成其余检查，没有吞掉失败或改写最终退出码。

## 边界

本报告确认 T1109 的验证入口修复和实际消费者透传。完整 verify 并非全绿，不代签全局 reconcile、安装或产品功能。
