# T1301 实现步骤控制面记录

冻结代码 `dc85a88a31b67e1bf0749e645d45bd90e184909a` 经独立实施复核：局部代码及现有受控行为PASS，89项不同用例通过、零跳过，类型/边界/语义/超时门通过；报告与机器输入SHA已复核。此记录不重复执行这些命令，不把局部PASS冒整体Gate。

真实前置事实为原production公共自动分类UNKNOWN/HOST_PORT_REJECTED，以及7项精确消费者RED。完整素材业务组合在实现后新增，只有后置基线反例；其完整组合前置RED缺失，不能追认、不能自动accepted-risk。新production真实分类、原task/call/结果及文件/跨组读回仍待验；原HTTP409不等于calls0、旧UNKNOWN不重发。

技能`gates/13-tdd-gate.md`要求适用确定性行为RED再实现至GREEN，`workflows/v3-4-build.md` DoD2同；未另设每个测试文件都需RED的规则。T1301 SPEC自身明确先实际RED至最终回执组合，故当前不签该组合前置TDD。`gates/_GATE_EVIDENCE.md`要求例外按对应范围/状态规则的用户真实accepted-risk处理；本轮没有该风险接受授权，不自动写入。

`progress.mjs`的done机械核current/watchdog/governance/依赖/lease，不替人验证TDD。C释放实施租约，保实施步骤pending，不调用done、不手改状态、不暂停或重开旧业务。待新candidate公共实证后交Root按准确范围裁决；不为处理缺失的历史重跑或伪造过去。T1302及独立candidate准备不以历史缺证为开始条件；父T1300最终依赖保留，不冒整体完成。
