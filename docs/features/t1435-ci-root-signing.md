# T-1435 双端CI接入既有sidecar签名根

用户于2026-11-02明确允许把提供的既有根私钥存入本仓GitHub Actions Secret，修复接入并重跑双端。失败基线run41448308905：双端sign-sidecar读取本机默认私钥路径ENOENT，未出安装包。

只改CI签名接入：打包step接收CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM，Node包装入口先从环境删除原始PEM，写到仓库外RUNNER_TEMP下随机目录的0600临时文件；先按既有sign-sidecar固定根核验，再只向release入口传路径。现有package剥离普通构建子进程中的路径机制不变。finally清理文件，工作流always步骤兜底清理；不得把私钥放仓库/包/artifact/日志，不换根、不降低签名或公证标准。已签capsule消费保持不读私钥。用户授权改变CI私钥托管位置，记录DEC，后续正式打包仍不建tag/Release或修改Growth。

验收：新增测试证明秘密不进入子进程环境、临时文件权限/位置正确，成功/失败均清理，缺/错密钥在构建前失败，capsule消费不要求新私钥；4组既有打包测试、diff检查；真实双平台run记录签名结果及包/验收情况。若另有构建失败保留实际日志，不冒称完成。不要求界面验收。

## 持续修复双端出包（用户追加授权）

用户明确要求“遇到问题必须修复，直到打出成功的安装包，双端”。覆盖本次打包链发现的阻塞，修复后重新冻结提交并构建；不再逐次询问。仍不建tag/公开Release，不改Growth配置，不降签名/公证/安装验收标准。原run41454572792中Mac已成功签名公证并真启动，Windows根预检通过后缺Pi。

首个后续修复：pnpm Windows默认virtual-store-dir-max-length=60（本机pnpm安装源码默认值已核对），Pi根entry会截断；按真实manifest定位源entry，Windows目标保持运行时可识别的完整Pi前缀，实际复制依赖闭包并验证可搬运深导入。同步修复日志已证的CfT Windows zip调用GNU tar误把C:作为远端：使用Windows系统tar.exe绝对路径，不删除浏览器能力。新增回归须经公共bundle入口，覆盖缩短名、原长名、缺包与运行时可解析结构。

后续run41465727989：Windows已通过Pi闭包复制和CfT随包，最终tar阶段污染哨兵把Codex原生依赖中的codex-windows-sandbox-setup.exe误判为本产品外层安装包。修复限定为实际Codex Windows x64原生包的固定vendor相对路径，并核对其真实package.json name/version/os/cpu与项目锁定声明；不能按文件名全局豁免，不能删掉Codex沙箱能力。原递归src-tauri、sidecar.tar.gz与用户安装包拒绝规则继续有效，新增正负族经公共guard验证。

run41473263553：Mac 完整公证、归档签名与真启动已通过，DMG 已下载并校验；Windows 最终 tar 生成后，AppleDouble 目录校验的 spawnSync 返回 exit null 且无 stderr。当前实现将完整目录缓冲在 64MiB stdout 中，已用超 64MiB 真实归档目录复现同样错误并通过修复后回归。修复保持原检查规则：目录输出写仓库外临时文件，再分块扫描全部条目；限制诊断与坏项样本内存，异常报告 error code/signal，finally 清理临时文件。不得跳过归档完整性或元数据检查，真实双端仍需重新构建验收。
