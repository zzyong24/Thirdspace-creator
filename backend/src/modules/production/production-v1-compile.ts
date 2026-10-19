import type { VideoRenderProps } from "@creatoros/contract";

export function compileV1RenderProps(props: VideoRenderProps): VideoRenderProps {
  // SEMANTIC_BOUNDARY_ALLOW: 只将无视觉编排的旧单文件表示编译为等价片段，
  // 复用原有 contain 输出；不判断内容、不选择素材，不修改正式工程。
  if (props.delivery.height > props.delivery.width || props.talkingHead.clips ||
    props.direction || props.captions.some(caption => caption.cn.trim()) ||
    props.broll.length || props.scenes.some(scene => scene.cards.length || scene.special || scene.mode)) {
    return props;
  }
  return {
    ...props,
    talkingHead: {
      ...props.talkingHead,
      clips: [{
        clipId: "legacy-v1-source",
        file: props.talkingHead.file,
        startSec: 0,
        endSec: props.talkingHead.durationSec,
        sourceInSec: 0,
        hasAudio: props.talkingHead.hasAudio,
      }],
    },
  };
}
