import { describe, expect, it } from "vitest";

import {
  contentRadarDraftSeedOf,
  resolveProjectScriptText,
} from "./project-script-truth";

describe("project script truth", () => {
  const briefDetail = {
    contentRadarEvidence: {
      adaptedDraftSeed: { contentText: "  雷达改写初稿  " },
    },
  };

  it("reads the adapted draft carried by a content-radar project", () => {
    expect(contentRadarDraftSeedOf(briefDetail)).toBe("雷达改写初稿");
  });

  it("uses the radar draft before the first persisted script version", () => {
    expect(
      resolveProjectScriptText({
        persistedText: null,
        persistedVersionCount: 0,
        briefDetail,
      }),
    ).toBe("雷达改写初稿");
  });

  it("keeps the persisted script authoritative after the first save", () => {
    expect(
      resolveProjectScriptText({
        persistedText: "正式口播稿",
        persistedVersionCount: 1,
        briefDetail,
      }),
    ).toBe("正式口播稿");
  });

  it("does not resurrect the radar draft after an intentionally empty save", () => {
    expect(
      resolveProjectScriptText({
        persistedText: "",
        persistedVersionCount: 1,
        briefDetail,
      }),
    ).toBeNull();
  });
});
