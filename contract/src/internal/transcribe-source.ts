import { z } from 'zod';

/** Stable platform identity; download addresses are never task input. */
export const transcribePlatformSourceSchema = z.object({
  platform: z.enum(['douyin', 'xiaohongshu', 'wechatVideo']),
  externalId: z.string().min(1).max(120).regex(/^[^\s:]+$/u),
}).strict();
export type TranscribePlatformSource = z.infer<typeof transcribePlatformSourceSchema>;

/** The awemeId port slot accepts a legacy identifier or a namespaced stable ID. */
export const transcribeAudioKeySchema = z.string().min(1).max(128)
  .regex(/^(?:(?:douyin|xiaohongshu|wechatVideo):)?(?![/\\]{2})[^\s:]+$/u);

export function transcribeAudioKey(source: TranscribePlatformSource): string {
  return transcribeAudioKeySchema.parse(`${source.platform}:${source.externalId}`);
}
