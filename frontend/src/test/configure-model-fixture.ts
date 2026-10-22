import { ENDPOINTS } from "@creatoros/contract";

type FixtureCall = (id: string, params: unknown, body?: unknown) => Promise<unknown>;

/** 用原公开设置把冻结路由绑定到本轮本地 HTTP 夹具，保留正式凭据和身份检查。 */
export async function configureModelFixture(
  call: FixtureCall,
  baseUrl: string,
  modelName: string,
  options: { image?: boolean } = {},
) {
  await call("settings.models.put", { capability: "default" }, {
    provider: "openai", modelName, secret: "fixture", baseUrl,
    apiFormat: "openai_chat", settings: { structuredOutputs: true },
  });
  if (options.image) await call("settings.models.put", { capability: "image.generate" }, {
    provider: "openai", modelName: "gpt-image-1", secret: "fixture", baseUrl,
  });
  const routing = ENDPOINTS.getModelRouting.response.parse(await call("settings.modelRouting.get", undefined));
  await call("settings.modelRouting.put", undefined, {
    schemaVersion: 1, expectedRevision: routing.revision,
    choices: { ...routing.effectiveChoices, text: "self", ...(options.image ? { image: "self" } : {}) },
  });
}
