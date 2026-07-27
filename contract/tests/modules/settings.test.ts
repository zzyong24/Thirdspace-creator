import { describe, it, expect } from "vitest";
import {
  modelConfigurationResource,
  storageConfigResource,
} from "../../src/resources/settings";
import { settingsOperations } from "../../src/operations/settings";

describe("settings contract", () => {
  it("parses a ModelConfiguration resource", () => {
    const m = modelConfigurationResource.parse({
      id: "model-script",
      userId: "user-zyongzhu",
      capability: "script",
      provider: "anthropic",
      modelName: "claude-sonnet",
      secretReference: "secret-script",
      baseUrl: null,
      apiFormat: "anthropic",
      settings: { temperature: 0.6 },
      isDefault: true,
      hasSecret: true,
    });
    expect(m.capability).toBe("script");
    expect(m.isDefault).toBe(true);
    expect(m.hasSecret).toBe(true);
  });

  it("rejects a missing required field", () => {
    expect(() =>
      modelConfigurationResource.parse({
        id: "model-script",
        userId: "user-zyongzhu",
        capability: "script",
        // provider missing
        modelName: "claude-sonnet",
        secretReference: "secret-script",
        settings: {},
        isDefault: true,
      }),
    ).toThrow();
  });

  it("registers the settings get + model upsert endpoints with FR ids", () => {
    expect(settingsOperations.getSettings.method).toBe("GET");
    expect(settingsOperations.getSettings.path).toBe("/settings");
    expect(settingsOperations.putModel.method).toBe("PUT");
    expect(settingsOperations.putModel.path).toBe("/settings/models/:capability");
    expect(settingsOperations.getSettings.fr.length).toBeGreaterThan(0);
  });

  it("putModel body accepts an inline secret (stored, not just env-ref)", () => {
    const body = settingsOperations.putModel.body.parse({
      provider: "minimax",
      modelName: "MiniMax-M3",
      baseUrl: "https://api.minimaxi.com/anthropic",
      apiFormat: "anthropic",
      secret: "sk-real-key",
    });
    expect(body.secret).toBe("sk-real-key");
  });

  it("accepts openai_responses as a first-class model protocol", () => {
    const body = settingsOperations.putModel.body.parse({
      provider: "new-api",
      modelName: "gpt-5",
      baseUrl: "https://new-api.example.com/v1",
      apiFormat: "openai_responses",
      secret: "sk-relay",
    });
    expect(body.apiFormat).toBe("openai_responses");

    const resource = modelConfigurationResource.parse({
      id: "model-default",
      userId: "user-zyongzhu",
      capability: "default",
      provider: "new-api",
      modelName: "gpt-5",
      secretReference: "",
      baseUrl: "https://new-api.example.com/v1",
      apiFormat: "openai_responses",
      settings: {},
      isDefault: true,
      hasSecret: true,
    });
    expect(resource.apiFormat).toBe("openai_responses");
  });

  it("registers settings.models.list (GET /settings/models) returning an array", () => {
    expect(settingsOperations.listModels.method).toBe("GET");
    expect(settingsOperations.listModels.path).toBe("/settings/models");
    const arr = settingsOperations.listModels.response.parse([]);
    expect(Array.isArray(arr)).toBe(true);
  });

  it("parses a StorageConfiguration resource", () => {
    const s = storageConfigResource.parse({
      backend: "local",
      rootPath: "/Users/x/CreatorOS/media",
      usedBytes: 1234,
      totalBytes: 500_000_000_000,
      breakdown: [
        { assetType: "image", bytes: 1000 },
        { assetType: "video", bytes: 234 },
      ],
    });
    expect(s.backend).toBe("local");
    expect(s.rootPath).toContain("media");
    expect(s.breakdown).toHaveLength(2);
  });

  it("registers settings.storage.get / put with FR ids", () => {
    expect(settingsOperations.getStorage.method).toBe("GET");
    expect(settingsOperations.getStorage.path).toBe("/settings/storage");
    expect(settingsOperations.getStorage.fr.length).toBeGreaterThan(0);
    expect(settingsOperations.putStorage.method).toBe("PUT");
    expect(settingsOperations.putStorage.path).toBe("/settings/storage");
    // The PUT body accepts a partial { backend?, rootPath? }.
    const body = settingsOperations.putStorage.body.parse({
      rootPath: "/tmp/creatoros-media",
    });
    expect(body.rootPath).toBe("/tmp/creatoros-media");
  });
});
