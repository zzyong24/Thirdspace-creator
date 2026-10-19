# 来源与修改记录

本连接包的 JSON bytes/entries、相对包名校验、Skill 收集、固定 ZIP 时间戳/权限/顺序及 SHA256 manifest 方式，改编自 dream-num/workbuddy-univer-office。

- 固定 commit：`856eae4fe416b28adffb96092d67ff26c7797ff4`，提交时间 2026-09-11 11:41:51 UTC。
- 原脚本：https://github.com/dream-num/workbuddy-univer-office/blob/856eae4fe416b28adffb96092d67ff26c7797ff4/scripts/package-workbuddy-connector.py
- stdio 生命周期：https://github.com/dream-num/workbuddy-univer-office/blob/856eae4fe416b28adffb96092d67ff26c7797ff4/src/mcp/main.ts
- 实际 Apache-2.0：https://github.com/dream-num/workbuddy-univer-office/blob/856eae4fe416b28adffb96092d67ff26c7797ff4/LICENSE
- 原始脚本仅作非可执行参考，见源码目录 `upstream/package-workbuddy-connector.py.txt`。

本项目修改：产物改为 CreatorOS 公开 MCP 模板、原生设置交付及一个领域 Skill；删除 Office npm/SDK/registry/目录授权/iframe 配置；只调用现有 CLI/dispatch；生命周期仅关闭当前 MCP，不取消后台任务。CLI 路径由原生壳输出，不读取用户 Agent 登录态、不自动修改全局配置。

配置路径与首次信任提示参考已有实现：

- PowerContext，Apache-2.0，`ba7dc8dddea2c37168dbaf801e6399a40aae49f1`：https://github.com/oceanbase/powercontext/blob/ba7dc8dddea2c37168dbaf801e6399a40aae49f1/src/powercontext/cli/workbuddy.py
- EverMe，Apache-2.0，`6739467509892c69a8d08073c250000120378029`：https://github.com/EverMind-AI/EverMe/blob/6739467509892c69a8d08073c250000120378029/cli/internal/plugin/workbuddy.go

未复制这两个项目的安装器或运行器。公开包不宣称腾讯官方认可、市场安装验收或 WorkBuddy 真机接通。

原始固定脚本 SHA256：`af4aa4594493fcc5a23fd6f92cd30c0d9b871e7505656f311f255f0f22fcd106`。
原始 LICENSE SHA256：`c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4`。
