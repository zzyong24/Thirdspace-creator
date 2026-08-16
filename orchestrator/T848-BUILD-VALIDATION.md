# T-848 Windows CLI 冒烟契约修复与正式包验证

## 上轮真实阻断

- 正式流水线：`31944755771`
- 冻结候选：`893db761b156c38387159c76daf3194bdc93bcf5`
- CreatorOS Windows 已完成 NSIS 真安装、主页面加载和 CLI launcher 执行；
  `creatoros.cmd --help` 退出码为 `0`，返回 `{"ok":true,"usage":"creatoros ..."}`。
- workflow 却硬编码匹配中文 `用法: creatoros`，将合法结构化输出误判失败，随后卸载和
  Windows 安装包上传被跳过。

## 本轮验收

- 回归测试先证明旧断言失败，再约束 workflow 必须解析 JSON 并验证 `ok=true`、`usage` 为
  非空字符串且以 `creatoros ` 开头。
- 正式 Windows job 必须通过构建、真安装、主页面加载、CLI 帮助、主动卸载和 artifact 上传。
- 下载 `setup.exe` 并计算 SHA-256；明确 Windows Authenticode 状态。
- 不创建 tag、GitHub Release，不更新公开下载、Activity/Growth 或真实用户配置。

## 本地修复证据

- TDD 红：workflow contract 新增 JSON 帮助契约后，旧实现 1 项失败（24 通过、1 失败）。
- TDD 绿：`desktop-release-workflow.test.mjs` 25/25。
- 正式打包四项基础测试：4 文件、42/42。
- Windows production closure：17/17。
- boundary：无新增违规（基线 5）；semantic boundary 与 `git diff --check` 通过。
- 实现不再按展示语言匹配；PowerShell 先 `ConvertFrom-Json -ErrorAction Stop`，再校验
  `ok=true`、`usage` 非空且以 `creatoros ` 开头。退出非零、非法 JSON 或契约不完整仍然失败关闭。
