# 真实默认 worker R2 回归：Unknown / exit 1

按ROOT核查和一次授权执行。路径realpath身份检查通过，真实 createDefaultWhisperLocalAdapter（无deps注入）进入 native ffmpeg → 默认eval worker → 真实transformers.js2.17.2。ffmpeg调用1次，固定输入解码306587样本；worker factory1/pipeline1，model.generate调用0，父子fetch/network0。

worker真实推理调用返回 LOCAL_WHISPER_INFERENCE / inference failed，发生在generate计数前。生产worker catch仅返回通用error，底层异常未暴露；不能据此确定是candidate guard、harness计数代理或库调用边界问题。未得到正文/词时码，strict timing必须保留Unknown，默认装配不得标注PASS。模型session已有真实加载（ONNX warnings保留），不能把model.generate0描述为完全未加载模型。

原WAV/MOV、7模型source与独立cache、4runtime/test与第5cancel及其它source，before/after SHA全部一致。未裁剪/扩展音频，未修改源码或依赖，未重跑，也未清锁。run-one首次harness路径误判、R2首次prepare临时WIP SHA失败证据全部保留。

完整原始stdout/stderr/exit、authorization、argv、counter、native decode argv、runtime身份与SHA见execution-evidence-r2.json和run-two/unknown.json。实际Node25.9.0；esbuild target node24仅为编译目标。

本次不验证公共reserve/settle、installed App、Skill语义采用或粗剪。任何后续诊断/脚本修改/产品修复/额外真实调用需ROOT另行明确授权，当前执行者已停止。
