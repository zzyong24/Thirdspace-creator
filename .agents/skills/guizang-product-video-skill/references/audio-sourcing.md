# 代码原创配乐，音效先找再回退

## 默认选择

音乐由模型为当前产品和分镜编写代码合成；音效优先查找符合动作、音色和使用条件的现成素材，找不到的类别再用 skill 内置音效。不要把两者合并为“先找整套音频”，也不要一开始就给全部动作套内置音效。用户明确指定音乐或静音时优先遵从。

## 原案例到底怎么做的

- 第一版：Python 叠加波形合成和弦、短音旋律、低音强调和提示铃音，直接输出一条 54 秒音轨。
- 后期版本（本 skill 默认采用的方法）：音乐仍用 Python 原创，48 秒、120 BPM，包含和弦铺底、短音旋律、贝斯、合成鼓点和结尾旋律；点击、弹出、键入、通知、短转场和收尾使用本地音效库里的录音，库内来源说明标注为 [Pixabay Sound Effects](https://pixabay.com/sound-effects/)。没有使用参考视频里的音乐/音效，也没有调用音乐生成模型。
- 原案例没有完整保留每条 Pixabay 录音的作者和详情页，不能替它们编造来源。本 skill 不捆绑这些第三方录音，内置的是由 `scripts/make_sfx.py` 生成的原创替代音效。

## 1. 为当前影片写配乐

先在工程中记录音乐的气质、时长、速度、第一拍、段落与结尾位置。用代码生成独立音乐轨；保留脚本、参数和固定随机种子。默认不下载一首现成 BGM，不调用音乐生成模型，也不把示例曲换个名字当成每个项目的新配乐。

可参考 [后期版本配乐源码](../assets/audio/codepilot-score-example.py)。该示例只依赖 Python 标准库和 FFmpeg，输出固定 48 秒、120 BPM 的音乐，不需要 Pixabay 文件或其他 skill：

```sh
# 先运行示例理解声音；输出目录必须为空，避免覆盖已有素材。
python3 <skill-dir>/assets/audio/codepilot-score-example.py --output <video-dir>/audio-example
```

正式制作将源码复制到视频工程再改编，输出最终 `assets/music.wav`，并将实际参数记入 `evidence/audio-selection.json`：

- 按产品气质选择和声、音色和旋律，节奏明快不等于旋律一直忙碌。代码合成不等于只放一个正弦波蜂鸣。
- 铺底、旋律、低音与打击乐分别控制包络、力度和声像；不要把动作点击/叮咚写死进 BGM，否则后面无法分别混音和让位。
- 段落服务分镜：开头迅速建立节奏，细节说明减少乐器密度，功能揭晓再增强，结尾有完整收束。
- 示例的时长、bar 循环、音符时间、鼓点范围与结尾淡出是相互关联的。改变时长/BPM 时统一用 beat/bar 计算时间，更新所有相关位置，检查越界与尾音；不能只改 `DURATION`。
- 单独导出并试听音乐，再按动作安排音效。记录真实 BPM/拍点，音乐剪辑后更新节拍依据。保留配乐源码，确保重新运行得到同样的音乐。

## 2. 音效先找合适的

优先检查用户已有、来源清楚的素材库，也可到 [Pixabay 音效库](https://pixabay.com/sound-effects/) 搜索。安装环境没有原案例的本地素材库时直接去素材站查找，不假设某个插件、账号或本地路径一定存在。

| 画面动作 | 可用搜索词 | 选择重点 |
| --- | --- | --- |
| 点击、选中 | soft UI click / button click | 短而清楚，不刺耳 |
| 弹出、切换 | UI pop / soft toggle | 轻巧，有状态反馈 |
| 输入 | keyboard typing short | 短簇，与画面输入节奏相符 |
| 通知、完成 | notification ding dong / success chime | 可识别的提示，避免拖尾过长 |
| 场景转换 | short soft whoosh | 听觉落点能对齐转场 |
| 收尾 | gentle logo chime | 与原创音乐调性及结尾配合 |

按实际镜头找需要的声音，每类比较少量候选即可。检查实际音频，不凭标题判定合适；记录详情页、作者（页面有则保存）、许可链接、本地文件和使用范围。下载链接须来自实际素材页面/下载操作，不编造 CDN 地址。使用当前环境提供的浏览器/下载工具，遇到需要用户账号或购买的限制，可换可访问的来源，不能假装下载成功。

先查素材再决定回退。如果某类音效没有匹配的候选、音质不合适、许可无法确认，或网络/工具使素材实际不可获取，就只对这一类用内置替代，不要求用户替模型继续找，也不反复无效搜索。找到合适的点击声后，即使通知声没找到，也保留选中的点击声。

## 3. 缺项用内置 WAV

[内置音效目录](../assets/audio/sfx/) 已有 11 个 WAV，清单、时长、哈希见 [manifest.json](../assets/audio/manifest.json)，来源见 [SOURCE.md](../assets/audio/SOURCE.md)。按需复制到视频工程，在 plan 的 cue 中指向实际文件。无需重新合成。

例如只缺通知音，下面命令只复制它，已有同名文件则拒绝覆盖：

```sh
python3 - <skill-dir>/assets/audio/sfx/ding-dong.wav <video-dir>/assets/sfx/ding-dong.wav <<'PY'
from pathlib import Path
import sys
source, target = map(Path, sys.argv[1:])
data = source.read_bytes()
target.parent.mkdir(parents=True, exist_ok=True)
with target.open('xb') as f:
    f.write(data)
PY
```

需要调整内置音色时才修改/运行 `scripts/make_sfx.py --output <new-sfx-dir>`，不要覆盖已经选定的外部素材。whoosh/sweep 的响亮落点位于文件中间，应试听/检查波形后设置 `syncOffset`；文件开始不等于声音落点。

## 4. 留下来源，再进入混音

工程 `evidence/audio-selection.json` 简要记录：

- `music`：`method: code-original`、工程内脚本路径、实际时长/BPM/段落、输出文件；如用户指定例外，写明依据。
- `sfx[]`：作用、查找渠道/关键词、选中素材的本地文件、实际详情页与许可信息；内置素材使用 `method: bundled-original`、asset ID、实际回退原因（例如“已查两组通知音，拖尾都盖住后一句说明”或“素材站不可访问”）。未知来源写未知，不伪造搜索经历。

下载素材用于成片与将原录音打包成可复用素材库是两种用途。[Pixabay 许可摘要](https://pixabay.com/service/license-summary/) 明确限制独立分发原素材，所以这个 skill 仅提供查找渠道和原创替代音效，不附原片 Pixabay MP3。制作时核对实际素材的现行许可，原工程整体许可不能替代音频许可。资料核对日期：2026-09-18。

最后按 [混音与成片检查](audio-and-qa.md) 对齐动作、处理 ducking，分别检查独立 SFX、混音与最终 MP4。素材选得好也不能省略音乐让位和卡点。
