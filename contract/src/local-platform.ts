import { z } from "zod";

const httpsUrl = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), "HTTPS URL required");

/** 可信本地 platform adapter 的只读反馈渠道响应。 */
export const localSupportChannelResponse = z
  .object({
    supportUrl: httpsUrl.nullable(),
  })
  .strict();

export type LocalSupportChannelResponse = z.infer<
  typeof localSupportChannelResponse
>;
