# T-826 构建验证：Windows 升级机安全切换到当前版本 runtime

## 用户能直接得到的变化

安装过 CreatorOS 旧版的 Windows 机器，不会再因为用户目录里残留旧 runtime 而忽略新安装包的
当前 runtime。新版会先验证新资源，再安全替换旧资源；新资源不完整或切换失败时保留旧副本。

```mermaid
flowchart LR
  A["用户目录已有旧 runtime"] --> C["校验是否属于当前版本"]
  B["安装目录有新 runtime"] --> D["复制到临时目录并校验"]
  C -->|"不是当前版本"| D
  D -->|"校验失败"| E["保留旧 runtime，明确报错"]
  D -->|"校验通过"| F["暂存旧 runtime"]
  F --> G["原子启用新 runtime"]
  G --> H["启动 sidecar 与主页面"]
```

## 实现边界

- 只修改 Windows runtime 迁移和正式 Windows 打包验收，不改项目数据、数据库结构、账号、密钥或业务页面。
- appData 已经是当前版本且完整时继续复用；只有旧版或无效 runtime 才由安装目录的新副本替换。
- 新副本完整性校验失败时不移动旧 runtime；原子提交失败时尝试恢复旧 runtime。
- 正式流水线同时模拟干净首装与“旧 appData + 新安装 runtime”的升级状态，主页面完成加载后才通过。

## 已通过的本地证据

- Rust 桌面壳完整库测试：165 PASS、0 FAIL、1 个需要真实 Growth/AM 环境的既有用例按声明 ignored；
  其中新增覆盖旧 appData runtime 被当前安装 runtime 替换、无效新 runtime 不改变旧副本。
- Windows runtime、启动安全、发布工作流、local-package、公证与签名配置聚焦测试：59/59 PASS。
- 打包工作流契约确认正式启动冒烟和候选 RAT 都会注入旧 runtime 标记，并验证标记已被当前版本替换。
- 物理边界无新增违规，语义职责边界 PASS；`pmem sync` PASS。
- 全局 `reconcile` 的 LED-006 新门卫 PASS；全局仍有 14 个既有错误，来源是 BACKLOG 体积、三份旧
  SPEC 审核回执过期和其他历史任务 frontend receipt 漂移，并非 T-826 新增失败，未冒充全局全绿。

## 尚未冒充通过的验收

- 尚未从本次修复提交构建新的 Windows 安装包。
- 尚未取得 Windows runner 的真安装、GUI 启动、sidecar health、主页面加载和卸载证据。
- 尚未由用户在原故障机器复验。因此 T-826 保持进行中、验收为“待验”，不得写成已完成或公开发布。
