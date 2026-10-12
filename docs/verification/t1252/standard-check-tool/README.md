# T1252 离线安装独占工具（待精确准入）

最新 `launch.cjs` **只有 install**；checks/list/test/build 参数均在spawn前拒绝。旧新造生命周期工具均原字节归档 `history`，没有执行安装正文。标准验证将在真实安装后新工具重新绑定实际TS/Vitest/Undici/esbuild实现并独评，不能拿旧shim库存准入。

第一执行行冻结入口clock，所有 require、realpath、source/hash校验计入prepare240000ms。固定实际Node25.9.0_2及PNPM bin/dist和完整1077代码实现SHA，207产品/测试/contract/lock/patch/已实测helper来源逐SHA。锁只移精确 mcp importer `undici7.27.2` 三行便还原原45d6 SHA，不动其它依赖解析。

精确离线安装：固定Node启动PNPM `--filter @creatoros/mcp-server install --offline --frozen-lockfile --ignore-scripts`，cwd本integration，CI模式禁生命周期脚本。缺离线包保真实非零，不启动网络補包。安装后直接mcp-server/node_modules/undici realpath必须本树.pnpm、version7.27.2。安装和运行后所有输入与完整PNPM代码逐SHA；types和新bundle均尚未运行。

生命周期完全复用 `owned-pg-runtime.cjs` 精确393f8877…，本工具不创建PG、不启用socket preload、不复制认证。该 helper 已有真实TERM-ignore→KILL181011ms/group0回执，只引用真实已验范围；这里尚未执行。固定child INSTALL1800000＋完整helper收尾2160000（birth/UID/processgroup精确归属、unknown不signalforeign、未知owned读取端释放、close/fd收据）。SIGINT/TERM只abort本child观察；未确认关闭/nonzero保失败。整体outer4920000=prepare240000+child1800000+helper2160000+after600000+margin120000，monotonic60k分段，正常即EOF。进入child前要求完整剩余，不压缩内层。

环境使用helper.cleanEnv并剔除CreatorOS/供应商secret、PG等；HOME/CODEX_HOME保持原值，不复制auth，TMP只fresh本轮realpath。不得启动模型、服务、浏览器、App、发布、foreignPG。输出真实stdout/stderr直写runRoot日志，helper childclose后fd实际close才返回，未知/剩余组保非零；不覆写历史或共享dist/.next。

仅 `node --check` 已实际0，未执行安装或正文。精确root+peer准入后命令：

```
CREATOROS_T1252_STANDARD_TOOL_REVIEWED=1 CREATOROS_T1252_STANDARD_TOOL_SHA256=<actualSHA> CREATOROS_T1252_STANDARD_BINDING_SHA256=<actualSHA> /opt/homebrew/Cellar/node/25.9.0_2/bin/node docs/verification/t1252/standard-check-tool/launch.cjs install
```
