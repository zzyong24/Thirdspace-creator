import { describe, it, expect } from "vitest";
import { modelConfigurationResource } from "../../src/resources/settings";
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

  it("registers settings.models.list (GET /settings/models) returning an array", () => {
    expect(settingsOperations.listModels.method).toBe("GET");
    expect(settingsOperations.listModels.path).toBe("/settings/models");
    const arr = settingsOperations.listModels.response.parse([]);
    expect(Array.isArray(arr)).toBe(true);
  });
});
