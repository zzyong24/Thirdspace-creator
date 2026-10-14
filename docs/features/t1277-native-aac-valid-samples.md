# T1277 原生AAC首尾有效样本取证

T1274真实候选2秒视频实物为48@24fps；AAC双声道90包92160样本帧/44100Hz=2.089795918秒。旧83b12c553完整生产kernel同输入真实导出与新候选AAC解码PCM逐字节相等（SHA a4b77962fb639ba72ff43b7fd98df3e432ac361ea58dca5a4aad0ca101cb1ddb），首/末超过1e-4阈值样本1997/90432均相等，完整容器和streams时间表相等。此样例的AAC差异为既有写出机制，不构成T1274新增退化；不扩称所有输入族无问题。

大白话：原编码器在声音前后带入额外样本，画面2秒，文件显示约2.09秒。接下来核编码前真实PCM和encoder packet元数据，判断priming/padding及是否需MP4 edit list；不通过裁掉有效声音或改包duration伪造对齐。

```mermaid
flowchart LR
 A[真实源声音] --> B[编码前PCM与起止]
 B --> C[AAC真实packet]
 C --> D[MP4有效样本与播放时间]
 D --> E[解码PCM与音画对齐核对]
```

范围：先取证既有AAC封装的有效样本边界，提出可复核修复SPEC；变更编码封装/裁剪规则前独立评审，保留原成功导出路径与用户已确认T1274沿用内核的范围。当前不改MediaBunny版本、生产codec、样本或任务期限，不要求用户预先接受风险。

证据：docs/verification/t1274/browser/old-new-kernel-media-comparison.json、两份完整MP4/PCM与当场old-kernel-aac-baseline.txt。该整体baseline仍FAIL（视频解码帧不等），独立AAC结论来自其真实PCM相等字段及文件，不能把整个测试签PASS；视频差异另在T1274内查修。

验收：明确编码前后样本/packet来源，至少普通AAC、不同sample rate、静音、分离视频音频、裁切源区间等输入族；若提出修复，先完整公共导出RED→GREEN、原可用样例和真实音画对齐，再记录类型/build/边界/timeout与对账。当前SPEC是取证卡，未独评、未开工修码、未完成。
