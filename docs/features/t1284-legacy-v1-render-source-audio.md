# T-1284 恢复旧V1字幕模板成片的原片音轨

T1281公共兼容验收当场发现：output-65bafd60-322/task-65bafd60-363为合法V1字幕模板，无clips，原probe与talkingHead.hasAudio=true、preview标签true；任务succeeded，但实际MP4只有48帧video/2秒，没有audio。原结果在docs/verification/t1281/public-families/legacyCaption/；保留task/MP4/失败，不修改成静音输入洗绿。

FR：合法旧V1原片明确有声时，成片保留原0到durationSec音轨。采用现有V2完整音频拼接/精确裁切路径，只在executor音轨装配局部将缺clips的单文件视作等价单段；不更改renderProps或HTML视觉，不追加字幕，不改变主文件、声音开关、画幅、源时长/入点。已有clips继续原路径；hasAudio=false不新增有声轨。

最小写集：backend/src/modules/execution/video-render/executor.ts 的final remux阶段mainClips局部fallback；executor.test.ts和必要原production-rough-render.real.test.ts回归。可在原SEMANTIC_BOUNDARY_ALLOW说明此为单文件到单段音轨的机械兼容，不识别语音、不选择内容。无clips有声0..durationSec复用原FFmpeg atrim/aresample/concat，保原video stream copy、原deadline/取消、sandbox/输入归属及缺音轨损坏失败。不能把无clips转写回正式工程或改变旧字幕画面。

```mermaid
flowchart LR
 A[已校验旧V1主文件与hasAudio] --> B[音轨编译时等价单段]
 B --> C[原FFmpeg裁切与音轨拼接]
 C --> D[原视频无损封装加真实原声音轨]
```

验收：保原真实公共丢声失败；正式executor入口先写当场RED，原无clips有声缺音轨raw仍从原输入重建、无声不新增音、已有多clip/静音片段顺序不变、取消/损坏保持。真实公共新明确request重跑同output322原V1同revision及输入，不重发或修改旧succeeded任务；原业务请求幂等、preview/正式plan不变，MP4有video+audio且实际PCM与原对应区间相关/时长相符，声音测试是信号核验而非人工听感。原pureV1与V2真实通过不得抹掉，必要回归其已有测试。最后类型、timeout/boundary/对账实记；没有新产品决策或发布授权要求，独评后实施。
