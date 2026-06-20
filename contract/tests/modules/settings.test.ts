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
      settings: { temperature: 0.6 },
      isDefault: true,
    });
    expect(m.capability).toBe("script");
    expect(m.isDefault).toBe(true);
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
});
