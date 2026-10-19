# T1295 正式V2公共成片实际结果

正式新增V2例真实 **1 PASS / exit0 / retry0 / worker1 / 约1分钟**，目录 `../runs/current-b663925f4edd`（实际完整路径见V2_ACTUAL_BINDING）。只用Root的existing-owned服务59136，不冒称fresh DB；专用owned-normal-binding的11个normal bundles执行前后逐项相同，execution-worker为f65897ce…且诊断tap不存在。没有用旧diagbinding代签正常运行。

唯一新组grp-0d74a350-53、project-0d74a350-55、output-0d74a350-66。原prepare请求c4bdf37a-d934-4de3-8bfc-c479c48daa76真实探针成功，原sources.adopt创建V2主轨；同来源assetFileId/fileDigest冻结。保存后真实get/preview/render，编译spec中唯一talkingHead.clip与精确输入mountAs和原文件digest一致，0→2秒、hasAudio=true。

原render requestId `f235d27e-1476-4a36-a545-af6844f43ed7`、task `ai-task-0d74a350-107`、attempt `production-render-135946b88dc92a08468a496eba3f33a44307631fc8361eceb724bfd8929afda8`。观察同一原任务至awaiting_confirmation，再原confirm成功并下载实际asset。没有重发或更换任务，checkpoint.pending=null，保存plan/revision在制作及采纳后保持不变。

产物822308B，SHA256 `8ffba4163ab5ffe1147230010a00bf3c06625bb2d647cf61d07d8b6cc9a571d5`。H264/640×360/24fps/48帧/2.000000秒；AAC/48000Hz/2.000000秒。ffmpeg全流解码成功，0.5秒画面非暗比例0.99958767，音频RMS0.08866851。真实preview已播放到>0.1秒并留图，截图已实际查看，显示合成彩色画面。

本代理owned浏览器明确close、browserConnected=false；driver/worker PID已退出，随机静态服务端口不再监听。只删除本代理唯一、UID/task/nonce与clip SHA匹配的可再生临时副本；全部证据保留。Root59136服务未停止，用户App未操作。

本次证明正常源码服务的V2公共制作链可用；没有捕获后端实际Chromium二进制路径或打包GPU状态，不代签正式安装包。V3原生工作台→保存→采用成片仍未执行，软件GPU黑片旧FAIL保持。V3候选另准备，不把V2成功改称backend native_scene渲染成功。
