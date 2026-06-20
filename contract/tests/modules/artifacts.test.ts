import { describe, it, expect } from "vitest";
import { artifactResource } from "../../src/resources/artifacts";
import { artifactsOperations } from "../../src/operations/artifacts";

describe("artifacts contract", () => {
  it("parses an Artifact resource", () => {
    const a = artifactResource.parse({
      id: "artifact-ainativebrowser-project-idea",
      projectId: "project-ainativebrowser",
      contentOutputId: null,
      currentVersionId: "av-ainativebrowser-project-idea",
      stage: "research",
      artifactType: "project_idea",
      title: "AI Native Browser 项目立意",
      status: "approved",
      archivedAt: null,
      createdAt: "2026-01-01T02:00:00.000Z",
      updatedAt: "2026-06-01T10:00:00.000Z",
    });
    expect(a.artifactType).toBe("project_idea");
    expect(a.status).toBe("approved");
  });

  it("rejects an unknown artifact status", () => {
    expect(() =>
      artifactResource.parse({
        id: "a",
        projectId: "p",
        contentOutputId: null,
        currentVersionId: "v",
        stage: "research",
        artifactType: "project_idea",
        title: "t",
        status: "published", // not an ArtifactStatus member
        archivedAt: null,
        createdAt: "2026-01-01T02:00:00.000Z",
        updatedAt: "2026-01-01T02:00:00.000Z",
      }),
    ).toThrow();
  });

  it("registers the artifacts list + versions endpoints", () => {
    expect(artifactsOperations.listArtifacts.method).toBe("GET");
    expect(artifactsOperations.listArtifacts.path).toBe(
      "/projects/:projectId/artifacts",
    );
    expect(artifactsOperations.listArtifacts.isList).toBe(true);
    expect(artifactsOperations.createArtifactVersion.method).toBe("POST");
    expect(artifactsOperations.createArtifactVersion.path).toBe(
      "/artifacts/:artifactId/versions",
    );
    expect(artifactsOperations.listArtifacts.fr.length).toBeGreaterThan(0);
  });
});
