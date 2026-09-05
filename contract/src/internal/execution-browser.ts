import { z } from "zod";

const browserId = z.string().min(1).max(128);
const browserUrl = z
  .string()
  .max(8192)
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "仅允许无内嵌凭据的 HTTP(S) URL");

/** 元素引用只在对应观察中有效；URL网络与会话归属仍由宿主校验。 */
export const browserObserveInputSchema = z
  .object({ sessionId: browserId, url: browserUrl.optional() })
  .strict();
export const browserActInputSchema = z
  .object({
    sessionId: browserId,
    observationId: browserId,
    action: z.enum(["navigate", "click", "fill", "wait", "extract"]),
    targetRef: browserId.optional(),
    value: z.string().max(8192).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue = (path: "value" | "targetRef", message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });
    if (input.action === "navigate") {
      if (!browserUrl.safeParse(input.value).success)
        issue("value", "导航必须提供 HTTP(S) URL");
      if (input.targetRef !== undefined)
        issue("targetRef", "导航不接受元素引用");
    } else if (input.action === "click" || input.action === "fill") {
      if (input.targetRef === undefined)
        issue("targetRef", "点击或填写必须提供观察中的元素引用");
      if (input.action === "fill" && input.value === undefined)
        issue("value", "填写必须提供值；空字符串表示清空");
      if (input.action === "click" && input.value !== undefined)
        issue("value", "点击不接受值");
    } else if (input.action === "wait") {
      if (input.targetRef !== undefined && input.value !== undefined)
        issue("value", "等待只能指定一个元素引用或 URL");
      if (
        input.targetRef === undefined &&
        !browserUrl.safeParse(input.value).success
      )
        issue("value", "等待必须指定元素引用或明确 HTTP(S) URL");
    } else if (input.value !== undefined)
      issue("value", "提取不接受任意表达式或值");
  });

export const browserObservationSchema = z
  .object({
    sessionId: browserId,
    observationId: browserId,
    url: browserUrl,
    title: z.string().max(2048),
    text: z.string().max(12000),
    elements: z
      .array(
        z
          .object({
            targetRef: browserId,
            role: z.string().max(128),
            name: z.string().max(1024),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((input, ctx) => {
    const refs = new Set<string>();
    input.elements.forEach((element, index) => {
      if (refs.has(element.targetRef))
        ctx.addIssue({
          code: "custom",
          path: ["elements", index, "targetRef"],
          message: "观察中的元素引用不得重复",
        });
      refs.add(element.targetRef);
    });
  });
export type BrowserObserveInput = z.infer<typeof browserObserveInputSchema>;
export type BrowserActInput = z.infer<typeof browserActInputSchema>;
export type BrowserObservation = z.infer<typeof browserObservationSchema>;

/** 只由宿主从用户任务冻结；模型与网页不得授予自身交互权限。 */
export const browserAuthorizationSnapshotSchema = z
  .object({
    source: z.literal("user_task"),
    allowedDomains: z.array(z.string().min(1).max(253)).min(1).max(30),
    allowInteraction: z.boolean(),
  })
  .strict();
export type BrowserAuthorizationSnapshot = z.infer<
  typeof browserAuthorizationSnapshotSchema
>;
