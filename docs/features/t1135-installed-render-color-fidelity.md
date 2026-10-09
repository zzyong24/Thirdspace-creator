# T1135 安装版中性粗剪成片色彩保真诊断

用户要求全功能稳定性验证，发现问题创建task及时修复。2026-10-09，root通过当前安装d712包正式CLI发现、描述并调用assets.get/assets.fileDownloadUrl，以原group和exact资产文件取得已批准r7成片及原中性视频；未读凭据/连接文件/库、未重发模型或渲染、未改原稿及素材。CLI返回相对URL，以公开status应用PID所属唯一OS loopback listener解析，非猜测来源。

大白话：视频能导出和播放解码，但导出的深蓝背景比原素材更暗。还未确定是工程效果、解码/编码色彩配置还是渲染器转换，先诊断再修复。

```mermaid
flowchart LR
 A[原中性视频 immutable file] --> B[已批准源入点6.76秒]
 B --> C[安装版r7导出成片]
 C --> D[正式下载与完整解码]
 D --> E[三时间点画面色彩偏暗 待核机制]
```

绑定：group grp-58776bff-101 / project project-58776bff-104 / output output-58776bff-119 / revision7 / task ai-task-69d4c1de-317；源asset-58776bff-125/afile-58776bff-134、成片asset-69d4c1de-367/afile-69d4c1de-368。原approved源入点6.76、时长8.16保持，不改任务/状态/采用。文件及CLI原业务回执仅在0700私有验收根，仓库只存安全元数据。

实际MP4完整解码exit0，H264/AAC、640×360/30fps、8.166667秒、245视频帧/383音频帧，199098字节。输出0.3/4.0/7.8秒与源7.06/10.76/14.56秒画面对应（深蓝、数字2、数字3），root通过view_image实际查看六张帧。PNG字节不相同，不将重编码要求伪成逐字节一致。进一步用ffmpeg crop=1:1:0:0 RGB24机械取相同背景角：源三帧均17/36/57，输出三帧均0/19/44。当前只证明颜色差异，尚未界定根因或应修层。

原始私有证据 installed-neutral-media-verification.json、installed-neutral-source-download.json、installed-neutral-frame-corner-diagnostic.json及全部命令收据。当前主分支70366979完整canonical已结束exit1/39ERROR，执行期间保持17条源码/SPEC/模块与reconcile配置冻结；本诊断仅追加BACKLOG/诊断文档/taskctl事件，不改当前检查规则、受测源码或消费者，不使早先治理快照代签新任务。

先核原saved editor、源/输出ffprobe色彩与像素信息、当前实际renderer公开完整调用链，再有明确修复范围SPEC/独立评审、保真实RED、原成功合法输入与安全输出回归。禁止先改颜色常量、删颜色观察/原视听断言、猜HDR或降级为全绿；不新增未经批准渲染/模型意图，保原任务/原幂等键和文件。此task未准入产品改动，不签原生播放器或实际真人视频效果。

进一步实际核对：原r7工程无B-roll、scenes、captions或其它显式叠加配置；主轨入点86528/12800=6.76秒。公开下载源文件SHA e6c0f4e…与冻结source.fileDigest完全相同，没有换源。源H264/yuv420p/25fps缺色彩标签；成片H264/yuv420p/30fps、tv/BT.709。标签及范围的差异仅作事实，不直接推根因。官方FFmpeg文档将范围转换与元数据标记区分，依据见 https://www.ffmpeg.org/ffmpeg-filters.html 和 https://www.ffmpeg.org/doxygen/8.1/vf__setparams_8c_source.html 。当前HyperFrames编码参数与输入准备链仍待逐段核验，不把孤立FFmpeg变换当安装完整渲染修复。

私有机械反证：同一原中性源7.06秒短片，分别执行当前未知色彩分支的format+BT.709标签与显式range/matrix归一，两者实际均exit0，解码背景15/36/56，不能复现安装成片0/19/44。此观察不是完整renderer修复PASS，明确不足以把输入准备/仅标签分支认定为根因；不先修改它。私有原argv/时间/退出码/SHA记录color-stage-isolated-mechanical-probe/result.json。

当前T1135仅诊断范围，尚未声明modules实现步骤；对其直接传`--step implementation`会被context-plan拒绝，这不是产品失败。当前仅读取根规划上下文；明确修复机制后再登记正式模块/SPEC并独评准入实现。
