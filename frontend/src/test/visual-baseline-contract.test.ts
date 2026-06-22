import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ROUTES } from "../../tests/fixtures/routes";

describe("visual reference baselines", () => {
  it("contains one immutable reference PNG per approved route", () => {
    expect(ROUTES).toHaveLength(17);

    for (const route of ROUTES) {
      const path = resolve(
        "tests/visual/__screenshots__/reference-images",
        `reference-${route.id}.png`,
      );
      const hash = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");

      expect(hash, route.id).toBe(route.imageSha256);
    }
  });
});
