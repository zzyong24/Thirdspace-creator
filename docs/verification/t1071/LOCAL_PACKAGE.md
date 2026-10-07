# T-1071 本地包交付证据

冻结源码 `5e6d025c172ba5fc7f671efcc1632f34cf998a8e`，分支 `codex/t1062-integrated-client`，构建前后工作树干净。四版本均为1.2.0，已核候选相对origin/main的181提交/5282路径，无禁入密钥或渠道清单路径。四文件44项打包基础测试实际通过，固定入口显式跳过安装并实际exit0；未修改仓库产品、构建、测试或文档来洗失败。

安装包：[CreatorOS-1.2.0.dmg](/Users/zyongzhu/Downloads/CreatorOS-1.2.0.dmg)；667000456字节。

SHA256：`475b55ba920292316d19233c0fcd51bb4c1c697aa4197e1ec594e84276f98701`。

不可变留存：[同源镜像](/Users/zyongzhu/CreatorOS-local-acceptance/t1062-20261005-wm9zxxwl/t1071-local-package-5e6d025c/CreatorOS-1.2.0.dmg)。

| 实际核验 | 结果 |
| --- | --- |
| hdiutil verify | exit0 |
| 构建App与镜像内App codesign --deep --strict | 两处exit0 |
| 7条App文件及符号链接镜像 | 字节完全相同 |
| 实际Mach-O内嵌完整性清单 | 1082条与同镜像tar逐一匹配 |
| 原生剪辑器 native.js | SHA `7f9650fa680a319a21cb362458d6bccb35c4bcd734f40431f90a66b43fe85a27`，与已验源码相同 |
| 私有只读镜像卸载 | exit0 |

这是本地ad-hoc包，未做Apple公证。没有push/tag/Release/updater或公开发布。安装版启动、逐项导航、200%按钮和统计性能仍待当前App未保存状态确认及实际安装操作；不据本包完整性代签启动或全功能完成。T-1071保持进行中。

准备脚本最初读取下载目录指向外置T7的旧链接时等待，固定入口尚未启动；中断实际143，原链接已可逆留存，外置文件未改，改用已验证的824本地留存备份后运行同一固定入口。首只读资源核验按排序清单随机seek gzip导致反复解压；所有镜像和签名步骤已实际0，单次顺序遍历保持全部期待哈希和1082条范围，实际0；随后停止重复只读脚本实际130，finally正常卸载0。两次中断、原部分记录与新完整证明均保留，未标成旧脚本整体PASS。

完整原始绑定和执行历史见 local-package-result.json。全局reconcile仍实际37错误/1告警，ERROR集合与824原基线相同，原T1018/T1015不销账。
