# T-752 BUILD 证据：智溯AI v1.0 macOS 本地渠道包

日期：2026-08-10（America/Los_Angeles）

## 结论

PASS（本地测试包边界）。已严格复用仓库内 `zhisu-ai` 渠道清单与不可变身份锁，从 CreatorOS
`1.0.0` 构建 Apple 芯片 macOS DMG。该包只用于用户本地查看，不是 Developer ID 正式包，未上传、
未公证、未创建 Release，也未修改 Growth、Activity 或下载地址。

```mermaid
flowchart LR
  A["已提交 zhisu-ai 清单"] --> B["身份锁与图标摘要校验"]
  B --> C["macos-aarch64 local-test 构建"]
  C --> D["DMG 完整性与安装身份校验"]
  D --> E["本机真实启动"]
  E --> F["仅保留本地文件·未发布"]
```

## 渠道身份

- `packageRef`：`zhisu-ai`
- 展示名称：`智溯AI`
- 渠道身份：`partner-p501444c`
- 应用 ID：`com.zhisunet.zhisuai`
- Keychain service：`com.zhisunet.zhisuai.desktop`
- 可执行文件名：`ZhisuAI`
- Windows UpgradeCode（为后续同渠道双平台保持稳定）：`249CE044-BB7E-4AC3-9D98-4BE1BD4AD818`

## 本地实跑证据

- 文件：`/Users/zyongzhu/Downloads/智溯AI-1.0.0.dmg`
- 大小：427,561,287 bytes（约 408 MiB）
- SHA-256：`4ab66408957295aba24d5cf53dfc66123738263db2f910302c5478a65fd452be`
- `hdiutil verify`：PASS，DMG checksum valid。
- 安装身份：应用 ID、展示名称、版本与渠道清单一致。
- 真实启动：PASS；本机启动进程 PID `19796` 后正常结束验证。

## 用户确认边界

- 按用户要求，本地包不执行 Apple 公证。
- 按用户要求，打包门禁不执行截图、像素或其他视觉回归。
- 本任务没有修改产品功能、界面或视觉。
- 正式 macOS Developer ID、公证、staple、Gatekeeper 与 Windows NSIS 验证由 T-753 的独立 GitHub
  渠道流水线提供，不能用本地结果替代。
