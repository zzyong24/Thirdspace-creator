import { describe, expect, it } from "vitest";

import { localSupportChannelResponse } from "../../src/local-platform";

describe("local platform contract", () => {
  it("accepts only a nullable HTTPS support URL", () => {
    expect(
      localSupportChannelResponse.parse({
        supportUrl: "https://support.example.com/form",
      }),
    ).toEqual({ supportUrl: "https://support.example.com/form" });
    expect(localSupportChannelResponse.parse({ supportUrl: null })).toEqual({
      supportUrl: null,
    });
    expect(() =>
      localSupportChannelResponse.parse({
        supportUrl: "javascript:alert(1)",
      }),
    ).toThrow();
    expect(() =>
      localSupportChannelResponse.parse({
        supportUrl: "https://support.example.com/form",
        purchaseUrl: "https://should-not-leak.example.com",
      }),
    ).toThrow();
  });
});
