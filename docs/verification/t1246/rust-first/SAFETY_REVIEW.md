# T1246 Rust unit 执行前独立只读检查

审查候选：533224f334c43cdb81a344424e420cad93784dd1。审查机制：独立子 Agent 源码/消费者阅读，具体模型标识无法由工具确认，unknown/inherited。未编译、未执行 Rust 测试、未启动 App、未建立 Appium/XCTest 会话、未连接 PG、未读写 Keychain/defaults 或真实激活状态。仅写本报告和 /tmp 静态清单。

## 结论与运行边界

可以在同 SHA 的独立 unit 工作树运行默认 feature 的 `cargo test --locked --offline --lib -- --test-threads=1`，条件是独立 target/TMPDIR、清除外部探针与包级环境覆盖，不加 `--ignored`、不加 `--release`、不启用 logtools，也不运行 App 或额外 `[[test]] workbench` harness。这里的“可运行”是副作用范围审查结论，不是执行 PASS，也不是全部测试均为纯函数：合法测试包含新建临时目录、回环 HTTP/Unix socket、新建并回收的本机进程及 macOS sandbox。

完整 App 验收仍因用户暂不授权而未完成。本结论不会授权真实激活、Chrome 外网探针或 Appium。

建议由 ROOT 在新的 unit 工作树执行以下命令并保存 stdout/stderr、exit、实际 harness 数量和 ignored 数量；本审查者未运行它：

```bash
python3 - <<'RUN'
import os, pathlib, subprocess
unit_root = pathlib.Path('/Users/zyongzhu/.codex/worktrees/integrated-unit-acceptance/Thirdspace-creator')
reviewed = '533224f334c43cdb81a344424e420cad93784dd1'
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=unit_root, text=True).strip()
if head != reviewed:
    raise SystemExit('候选 SHA 不符，NOT-RUN')
owned = pathlib.Path('/tmp/t1246-rust-unit')
owned.mkdir(parents=True, exist_ok=True)
(owned / 'tmp').mkdir(exist_ok=True)
env = dict(os.environ)
for name in list(env):
    if name.startswith(('CREATOROS_', 'GROWTH_', 'TAURI_')) or name in ('NODE_OPTIONS', 'NODE_PG_FORCE_NATIVE'):
        env.pop(name, None)
env['CARGO_TARGET_DIR'] = str(owned / 'target')
env['TMPDIR'] = str(owned / 'tmp')
with (owned / 'first.log').open('w') as log:
    result = subprocess.run(['cargo', 'test', '--locked', '--offline', '--lib', '--', '--test-threads=1'], cwd=unit_root / 'frontend/src-tauri', env=env, stdout=log, stderr=subprocess.STDOUT)
(owned / 'exit.txt').write_text(str(result.returncode) + '\n')
raise SystemExit(result.returncode)
RUN
```

执行前还应比对 unit 树 Rust 来源与冻结源 SHA，包括 Cargo.toml/Cargo.lock/build.rs、src、vendor、canonical product-identity.json 和 include_str! 的合同夹具，不复用已改动源码。主线程已持有源快照，需按真实清单核对，以上 HEAD 检查不能替代脏改检查。`--offline` 缺依赖/工具链/链接器/系统 sandbox 时如实记录环境失败，不自动联网安装、不换断言。读现有 Cargo 缓存不等于启动 App。build.rs 写 verdict blob/ProductManifest 到独立 OUT_DIR；Tauri build 可能在 unit 源树生成 ACL/schema 工件，须记录 unit 树 before/after，不能把生成副作用写回冻结 integration。

## 实际消费者与副作用核对

- Cargo `[lib]` 的 lib.rs 引入 license、activation_reset、product_identity、cli_access、entitlement_claim、owned_devices、decoy_gate、logging、workspace_reset；macOS sidecar_process；workbench 的 files/command/ipc 及默认 feature 的 browser/browser_ipc。command_windows 在 cfg(test) 可编译的纯拒绝/快照测试仍纳入。`cargo test --lib` 不执行 main 的 Tauri run 和单独 `[[test]] workbench` target。
- lib.rs:2364 以后 Tauri setup/startup 的共享 CLI 初始化、master key、license chain、真实 sidecar/App builder 均没有从非忽略测试调用。测试的 codesign 仅 `interpret_codesign` 注入字符串；master-key 仅确定性混淆往返，未调用 `resolve_master_key`。runtime 清理/解压/导出测试只传本例临时目录。
- cli_access.rs:654 起 RenewalFixture 给 runtime.dir 分配 temp_dir + PID + label；renew/revoke 仅该目录。launcher 测试用 `install_launcher_at(..., root/bin/creatoros)`，没有调用真实 HOME 的 install_launcher/enable_runtime/initialize。因此不会撤销或覆盖共享 CreatorOS CLI 凭据与启动脚本。
- license.rs:3264 起使用 FakeServer、FixedClock、MemPoint；channel/snapshot 文件在本例临时目录。没有非忽略测试调用 prod_points、DefaultsLastSeen、HomeFileLastSeen 或 run_chain_and_persist；不会访问固定 defaults 域或真实授权服务。entitlement_claim 使用 MemoryJournal/MemoryCredentialBackend/SequenceTransport，真实加密 snapshot 只写临时目录；真实 Growth/AM 测试 :1657 有 #[ignore]。owned_devices 使用内存/fake transport，文件 recovery 使用独立随机临时路径；owned_devices_http_lab 真实联网/owner approval 测试也明确 #[ignore]，普通 origin 解析测试不联网。
- activation_reset 单元测试注入 stop/secondary closure，所有 whitelist/DB/auth 哨兵均在 fixture root；没有调用真实 clear_platform_seen defaults。workspace_reset/logging 删除与改名均限定 fixture temp root。不会重置用户数据库、授权态或日志。
- lib.rs 两个 HTTP probe 测试主动 bind 127.0.0.1:0，服务响应由本例线程写入；build_sidecar_probe_client :838 真实 `.no_proxy()`，URL 固定本例端口，不向代理或外网发送。
- workbench IPC 使用新临时私有 Unix socket + 临时 task roots。mac command 用 echo/cat/sleep 等显式 fixture，生产 launcher env_clear、task cwd、mac sandbox；受控取消只针对新建子进程组。sidecar_process_tests 的 sh/sleep 新建 process_group(0)，OwnedSidecar 归属校验后 stop/drop/watch 回收；错误组测试不发组信号。browser 普通测试使用 /missing/cft 或不会启动的临时 fake executable，invalid/missing admission 在启动前失败；OS absence 的 yes 进程仅使用本例临时 profile 标记，kill/wait 仅本例 child。真实 CfT、外网 RFC 与外部 Node/DB 探针明确 ignored。
- 环境必须清理：ipc::authorized_child_probe / unauthorized_child_probe、browser_ipc::unauthorized_child_probe 单独测试会读取 CREATOROS_*TEST_SOCKET；若继承他任务变量可能访问他任务 socket。清除 CREATOROS_/GROWTH_/TAURI_ 后，父测试仅对自己的新建 socket 定向传变量。HOME 不重设，不依赖伪隔离身份。

## 静态覆盖清单与已发现问题

/tmp/t1246-rust-static-inventory.json 记录 20 个含测试源文件及 SHA。全文件原始声明 288 个 #[test]，16 个 #[ignore]；这是跨平台静态数量，不是执行 count。按当前 macOS、debug、默认 feature 的可达 cfg 阅读，约 280 个声明进入 lib harness，其中 13 个 ignored、267 个非 ignored；精确实际数量必须以 ROOT 编译后 harness 输出为准。没有 tokio::test 属性；异步测试通过显式 tokio runtime 执行。Windows 仅目标模块没有在当前 macOS 上被证明。

RU001：三个真实 lib 子 harness 调用缺少嵌套模块前缀，可能零用例成功。

- workbench/ipc.rs:650 exact_spawned_child_can_connect 子程序 args `[--exact, ipc::tests::authorized_child_probe]`。
- workbench/ipc.rs:666 different_real_process_is_rejected_even_with_socket_path 子程序 args `[--exact, ipc::tests::unauthorized_child_probe]`。
- workbench/browser_ipc.rs:395 different_process_cannot_call_browser_socket 子程序 args `[--exact, browser_ipc::tests::unauthorized_child_probe]`。

lib.rs:43 引入 `mod workbench`，真实全名因此带 `workbench::`。既有字符串在单独 workbench target 中可能有效，在 --lib 中不能匹配对应函数。Rust harness 零匹配正常 exit0，父测试仅检查 success；这三个父测试的 PASS 不能代签真实子进程鉴权成功。此为静态确定的覆盖缺口，尚未补拍实际红测；首轮保原日志，不在冻结 source 修复。集中修复候选写集仅上述两测试源文件，需保真实 IPC 校验且证明子 harness 实际运行预期用例；不要把三项标成 App UI 或系统认证通过。

RU002（覆盖限制）：mac_cancel_terminates_spawned_descendant 依赖 /opt/homebrew/bin/python3，不存在时直接 return，harness 可显示 PASS 但无后代取消执行。若 ROOT 本机缺该文件，应明确记录案例机制未执行，不用套件绿色替代该行为证据。它不触发 App/认证；若存在仅运行本例 sandbox Python/sleep。

测试进程数/墙钟可能受原 GRACE=130s/FORCE=120s 的真实清理测试影响；不缩短原预算。所有判断仅覆盖冻结源码路径，未知新增 runtime 或 --ignored 不由本报告代签。
