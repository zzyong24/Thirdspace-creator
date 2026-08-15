import { describe, expect, it } from "vitest";

import { artifactResource, artifactType } from "../src/resources/artifacts";

describe("artifactType historical compatibility", () => {
  it("keeps cover_copy readable so one legacy row cannot poison artifacts.list", () => {
    expect(artifactType.parse("cover_copy")).toBe("cover_copy");
    expect(
      artifactResource.parse({
        id: "artifact-cover-copy",
        projectId: "project-1",
        contentOutputId: null,
        currentVersionId: "artifact-version-1",
        stage: "publishing",
        artifactType: "cover_copy",
        title: "封面文案",
        status: "drafting",
        archivedAt: null,
        origin: null,
        createdAt: "2026-08-15T00:00:00.000Z",
        updatedAt: "2026-08-15T00:00:00.000Z",
      }).artifactType,
    ).toBe("cover_copy");
  });
});
