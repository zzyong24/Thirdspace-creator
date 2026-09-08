/** 转写执行循环已迁入 ai-worker/execution/transcribe-worker-run；保留旧结果诊断类型。 */
/** transcribe 端口 fetchVideoUrl 的返回契约(runner 只需无水印直链)。故意在 runner 本地定义、
 *  不 import 前端 ingestion 的 DouyinVideoUrl —— 保持「AI 逻辑不依赖前端设施」的包边界(T-163);
 *  结构与 ingestion 侧 DouyinVideoUrl 兼容,host 注入的真实现可直接赋值。 */
export interface DouyinVideoUrl {
  playUrl: string;
  coverUrl?: string;
}

/** [T-243] fetchVideoUrl 端口的扩展返回:视频(带直链)或图集(非视频作品,诚实跳过)。
 *  video 变体的 kind 可省略 —— 既有 host/fake 返回裸 { playUrl } 仍类型兼容(零回归)。
 *  与 ingestion 侧 DouyinVideoSource 结构兼容(runner 本地镜像,保持包边界,同上)。 */
export type DouyinVideoSource =
  | ({ kind?: "video" } & DouyinVideoUrl)
  | { kind: "image-album" };

/** [T-243] 图集占位逐字稿(写进 ensureTranscriptArtifact 现有幂等锚,防每轮重查;
 *  文本本身诚实标注非口播,不会被误当真逐字稿)。 */
export const IMAGE_ALBUM_TRANSCRIPT_PLACEHOLDER = "(图集作品,无口播音频)";

/** [T-243] 失败原因分类(观测覆盖率用;errorMessage/汇总 step 按类计数)。
 *  [T-230] 新增 cooldown:限流冷却类(DouyinCooldownActiveError)——批级延迟重试的选取依据。 */
export type TranscribeFailureCategory =
  | "parse-failed" // 直链解析失败(iesdouyin _ROUTER_DATA / detail aweme_detail)
  | "ffmpeg" // ffmpeg 抽音非 0 退出 / 无字节(已含单次重试后仍失败)
  | "captcha" // 登录态回落路径命中验证码
  | "cooldown" // [T-230] 撞限流冷却快速失败(通道 cooldown 中)——等冷却结束可重试
  | "other"; // 其余(ASR / 网络 / 未知)

const FAILURE_CATEGORY_LABELS: Record<TranscribeFailureCategory, string> = {
  "parse-failed": "解析失败",
  ffmpeg: "ffmpeg",
  captcha: "验证码",
  cooldown: "限流冷却",
  other: "其他",
};

/** [T-243] 按错误消息把单作品失败归类(纯函数,可单测)。与取流层的错误文案约定对齐:
 *  验证码 → captcha;streamAudioFromVideo → ffmpeg;parseDouyinVideoUrl / parseAwemeDetail /
 *  fetchDouyinVideoUrl(HTTP/请求失败也归解析取流类)→ parse-failed;其余 → other。
 *  [T-230] 冷却类优先判(gateway 的 DouyinCooldownActiveError 消息含「冷却中」/类名)。 */
export function classifyTranscribeFailure(
  reason: string,
): TranscribeFailureCategory {
  if (reason.includes("冷却中") || reason.includes("CooldownActive")) {
    return "cooldown";
  }
  if (reason.includes("验证码")) return "captcha";
  if (reason.includes("streamAudioFromVideo")) return "ffmpeg";
  if (
    reason.includes("parseDouyinVideoUrl") ||
    reason.includes("parseAwemeDetail") ||
    reason.includes("fetchDouyinVideoUrl")
  ) {
    return "parse-failed";
  }
  return "other";
}
