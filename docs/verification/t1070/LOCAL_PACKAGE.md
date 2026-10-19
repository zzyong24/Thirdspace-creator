# T-1070 本地测试包

已从干净冻结提交 `82406168b95dc4fe02c26adf4e6f35d884ef9e81` 使用固定入口真实构建 CreatorOS 1.2.0 macOS arm64 包；没有修改产品代码、测试断言或构建脚本洗绿，也没有推送或发布。

安装包：[CreatorOS-1.2.0.dmg](/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1070-local-package-82406168/CreatorOS-1.2.0.dmg)，666830233 字节。SHA-256：`9f43ed142f5dcf8c494d4628824bd88f7ee306ba05e1cab69a1c9922fcd5de0b`。私有验收根保存不可覆盖的同字节副本和上一包备份。

| 当场核验 | 结果 |
| --- | --- |
| 固定打包入口 | exit0，明确跳过安装 |
| 四项基本打包检查 | 4文件44项通过 |
| hdiutil镜像验证 | exit0 |
| 构建App及镜像内App的深度严格签名验证 | 均exit0；本地ad-hoc，未Apple公证，不是Developer ID正式发布 |
| 镜像App与本轮构建App | 7文件/链接全部同字节 |
| 实际可执行文件内完整性清单→镜像sidecar | 1082条全部匹配，0差异 |
| 包内视频组件 | SHA7f9650fa与真实React首帧/CAS/Undo/保存/导出已验收版本一致 |
| 当前安装App | 本轮未退出或替换，安装版启动和逐项验收仍未完成 |

```mermaid
flowchart LR
 A[脚本联合生成及文章图文编导实测] --> C[已提交冻结源码]
 V[原候选原生预览 采纳 保存 导出实测] --> C
 C --> P[真实本地构建及DMG核验通过]
 P --> S[确认当前稿已保存]
 S --> I[按已授权安排备份及替换安装]
 I --> E[安装版启动和逐功能验收]
```

安装前只待用户答复当前稿是否全部保存；任务SPEC明确不强关未保存客户端，固定安装步骤会退出当前App。原安装授权保持有效，此处不是重新申请安装许可。

完整机器记录见 [local-package-result.json](local-package-result.json)，功能实测范围与未验项见 [CURRENT_VALIDATION.md](CURRENT_VALIDATION.md)。全仓对账仍37错误/1告警、原AAC约85ms尾段和未进行的字幕/变速/替换真模型逐项验证全部保留；本包不代表整个T1070、T1069或T1062完成，不代签用户验收。

2026-10-07 T-1071正在将导航生命周期窄修纳入新冻结包；此文链接保留82406168历史包不可覆盖副本，Downloads规范路径后续指向最新候选，以T-1071出包记录为准。
