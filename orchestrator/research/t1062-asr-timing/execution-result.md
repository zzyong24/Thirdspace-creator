# 单次同源 ASR 观测与无模型重放结果

唯一新增模型观测成功：pipeline1/model.generate1，86个forward是该次自回归decoder步；native16k/s16 WAV同SHA/count306587，未新增ffmpeg解码、输入静音或样本。真实feature[1,80,3000]、encoder[1,1500,768]、attention[1,12,1,1500]证明实际stride=2。原num_frames1916在1500 attention域截取整段；按真实尺寸/feature hop派生958，而不是猜÷2。完整原cross/decoder/token timestamps共76,459,164B，在128MiB上限内逐buffer流写。原model/cache/driver源码 SHA前后相同，network0，未写仓库或用户资料。

原provider尾时码18.36→19.4仍负，当前driver仍无verified timing；所有前两输入四模式negative原文件SHA未变。

初版两个offline命令都真实exit1：直接并行内部ESM入口触发循环初始化ReferenceError，尚未跑DTW。初次stdout/stderr与verify源码SHA保留。经root授权，仅/tmp修harness为先初始化标准transformers.js再顺序import。原verify.mjs/cjs现已byte-exact恢复（compiled SHAd2f76fe84a2c96830b5392793bb46ba4b58233d33b31fd9a86a9e77834d6211c）；独立verify-r2.mjs/cjs保存修订。恢复原路径前的一次临时R2 evidence exit0也单独记录，没有隐藏历史失败。

独立新R2命令两项exit0，stderr空：

```
node --max-old-space-size=512 /tmp/t1062-asr-timing-observation/verify-r2.cjs evidence /tmp/t1062-asr-timing-observation/capture-one
node --max-old-space-size=512 /tmp/t1062-asr-timing-observation/verify-r2.cjs timing /tmp/t1062-asr-timing-observation/capture-one
```

当场assert：原prototype函数SHA相同；original this.config、全部原层/head/dtype/shape/序列保留；legacy token timestamps逐字节等于capture；legacy raw/text严格一致；原timing负保持。只有物理stride派生crop的DTW重放改变词码，65 ranges通过同一实际readActualProviderTiming合同；最终“大家。”293760→306240，≤306587，无final timestamp clamp或输入补长。原provider自带2位round/tokenizer步骤原样复演以保证fidelity，没有事后修改chunks。两条verify只读证据、重放算法，无model/session/新decode/network/文件写。

可确定这份capture的word frame-domain问题及同源候选修正；不能代替segment、其它输入族、声学精度、默认worker/安装版、公共组/账本/native editor或完整词句粗剪验收。当前产品factory还没有修复，research两个criterion通过不等于产品成功。所有argv/exit/原始stdout/stderr/SHA与文件revision见execution-result.json。
