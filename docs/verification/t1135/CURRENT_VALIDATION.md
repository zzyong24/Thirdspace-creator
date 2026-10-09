# T1135 当前实际验证

旧安装d712包：原批准粗剪r7的公开下载、完整解码、245帧、音频存在及三处画面区间对照通过；颜色不通过，三处均偏暗。原文件SHA匹配工程；无显式叠加，源25fps未知色彩与输出30fps BT.709事实记录。根因UNKNOWN，尚无产品变更/新渲染，任务保持进行中。原生播放器与703主线新包未验收。

前期metadata helper把status.access字符串当字典而失败、首次下载仅准绝对地址导致相对URL断言失败、一次描述了不存在的assets.files.getDownloadUrl（真实exit2）均不冒称产品缺陷。随后读取当前inventory.operation字段，真实assets.fileDownloadUrl公开操作成功；只从公开App PID所属唯一OS loopback listener解析相对URL，未读连接文件/凭据/原库或猜媒体地址。独立解码输出未改用户资产。完整正式receipt与安全帧摘要已保存，原始API/文件留私有0700目录。

任务登记与taskctl事件发生在703完整canonical运行期间；只新增诊断控制与证据，原受测17条源码/配置SHA不变，早先治理快照不代签本新任务。完整检查终态待记录。
