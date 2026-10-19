# T-1246 浏览器 driver 最终准备复核

2026-10-11，独立子 Agent，具体模型 `unknown/inherited`。本轮仅只读文件与列举证据，不运行 Next、PG、长 E2E 或 App；未修改冻结 integration。

绑定候选 `533224f334c43cdb81a344424e420cad93784dd1`。当场 `git status --porcelain` 为空。新版 `driver/manifest.json` SHA256 `cce56bc1fd2c16701535cadf0b28b028330733ad6f351c464b5587a6ddb35529`；原/生成各 100 个完整文件清单、所有文件 SHA、6 个 driver 文件 SHA 全部匹配，246 处编辑按 UTF-16 偏移独立逆重构回原字节，错误 0。

DR-001 已解决：七个原 `orchestrator/evidence` 输出、radar 旧环境变量/回退、两处 afterAll、T1070 环境输出以及 settings 两个分拆目录均显式迁入本轮 runDir。所有原读取/断言与输入保留；唯一旧 verification 输入为实际 `t1101/user-baseline.png`，没有当作输出改写。

DR-002 已解决：launcher 读取 `.cjs/.mjs/.js`，并从真实 `ai-worker/scripts/build.mjs` 每个 outfile 检查实际产物存在，再记录 SHA；不能用任意文件凑非空。Next 仍用真实 loadConfig 与已核官方已装源码的 standalone-config 消费，独有 distDir，拒绝桌面构建环境，不 predev 重建 Worker。

DR-003 已解决当前冻结：原/生成全树 exact inventory 与每个 fixture SHA 已校验；driver SHA 守卫存在；产品路径脏改被拒绝；运行绑定最终 HEAD 与独立 source SHA，准备时旧 sourceCommit 只记 provenance，不强迫 commit 自引用。主线程本轮运行前后仍需复核最终产品/测试/driver 清单，禁止在首轮中修改。

静态准备复核未发现新的阻断项，可在实际包已完成后执行本轮受控浏览器首轮。`PACKAGE_READY=1` 必须绑定真实本轮包路径、SHA 和候选，不能仅凭变量签打包。54 文件/170 用例的实际 list 不是执行 PASS；新增整合用例分母单列。实际 startup、同 ID 后台结果、全量首轮失败、Next/Worker 字节与退出清理尚未验证。用户 App 暂不授权仍保持未完成。
