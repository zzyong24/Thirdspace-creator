# 音频示例与内置音效来源

- `codepilot-score-example.py`：从 CodePilot 后期 48 秒宣传片的 `source/make-score.py` 中提取独立音乐合成部分，增加输出路径参数及防覆盖检查。音乐由波形、噪声、包络和音符编排生成，无外部采样、无生成模型调用。原脚本中加载 Pixabay 音效和混音的部分未包含。它是改编参考，不是每个产品的固定配乐；正式配乐默认在当前视频工程中用代码原创。
- `sfx/*.wav`：由本 skill 的 `scripts/make_sfx.py` 生成，48 kHz、单声道、16-bit PCM。包含 click、click-alt、pop、toggle、typing、ding-dong、success、error、resolve、whoosh、sweep，共 11 种；各文件时长与 SHA-256 见 `manifest.json`。没有第三方录音或参考视频采样。
- 这些原创音效按用户要求随 skill 提供，供宣传片在未找到合适素材时使用和调整；不是原片使用的 Pixabay 录音。它们的来源说明不扩展到外部下载素材，也不改变 `assets/fallback/` 中组件所附的许可证。
- 本目录不包含 Pixabay 原始录音，也不包含混入这些录音的原片 master。原录音来源与查找方法见 [配乐创作与音效查找](../../references/audio-sourcing.md)。

使用时先按画面职责找合适音效，只复制缺项；要改变音色可在新目录重新生成。素材与音乐组合后仍须试听、调整 gain、对齐动作，并在音效出现时平滑压低音乐。
