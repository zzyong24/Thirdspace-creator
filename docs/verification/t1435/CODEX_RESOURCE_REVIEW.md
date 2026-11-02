# Codex原生资源误判修复

原run41465727989中Windows已实际通过既有根预检、工作台CfT随包及Pi闭包复制，随后污染哨兵误拒Codex的沙箱setup运行资源，非CreatorOS外层安装包。原失败保留windows-41465727989-result.log，不把前段通过当成安装包成功。

前置安全评审与实现后复核均由review_ci_signing只读完成，无阻塞项。仅完整node_modules/@openai/{codex|codex-win32-x64}/vendor/x86_64-pc-windows-msvc/codex-resources/codex-windows-sandbox-setup.exe尾路径、包根普通manifest、精确name及版本、os/cpu唯一对应数组全部匹配时豁免。项目声明仍为身份来源，未按文件名全局豁免，未删除沙箱能力。

公共guard新增20个正负族，真实RED保留；6组108测试通过，原外层setup/msi/dmg/app.tar.gz/sidecar.tar.gz及递归src-tauri阻断不变。原生包身份由npm registry官方metadata核实，非猜测。新候选仍需原生双端构建与安装验收，不冒测试为真机成功。
