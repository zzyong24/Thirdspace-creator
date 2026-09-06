import { it, expect } from "vitest";
import { generateText } from "ai";
import { modelFor } from "./provider-factory";
import { providerIdentityFor } from "./provider-identity";
import { createDurableGenerationModel } from "../execution/durable-generation-model";
it.each(["anthropic", "openai_chat", "openai_responses"] as const)(
  "%s 实际 SDK 请求身份与宿主投影一致",
  async (apiFormat) => {
    for (const customEndpoint of [false, true])
      for (const managed of [false, true]) {
        const spec = {
          apiFormat,
          baseUrl: customEndpoint ? "http://fixture.invalid/v1" : null,
          model: "fixture",
          token: "fixture",
          ...(managed ? { displayModelKey: "channel-managed" as const } : {}),
        };
        let request: Record<string, unknown> | undefined;
        const model = createDurableGenerationModel({
          model: modelFor(spec),
          operationKey: "probe",
          ports: {
            reserve: async (value) => {
              request = value.request;
              throw new Error("已捕获请求，禁止联网");
            },
            start: async () => {
              throw new Error("禁止启动");
            },
            settle: async () => {
              throw new Error("禁止结算");
            },
          },
        });
        await expect(
          generateText({
            model,
            system: "系统",
            prompt: "正文",
            maxOutputTokens: 128,
            maxRetries: 0,
          }),
        ).rejects.toThrow("已捕获请求");
        expect({
          modelId: request?.modelId,
          provider: request?.provider,
        }).toEqual(providerIdentityFor({ ...spec, customEndpoint }));
      }
  },
);
