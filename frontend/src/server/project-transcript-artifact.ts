/**
 * 项目逐字稿存在性唯一口径。
 *
 * transcribe runner 把真稿落为 output_script，当前版本的 contentData.awemeId
 * 指向来源作品。这里不以“有 output_script”粗判，避免把普通输出脚本误当逐字稿。
 */
export interface TranscriptArtifactSummary {
  readonly id: string;
  readonly artifactType?: string;
  readonly currentVersionId?: string;
}

export interface TranscriptArtifactVersion {
  readonly id: string;
  readonly contentData?: Record<string, unknown>;
}

export interface TranscriptArtifactReader {
  listProjectArtifacts(
    projectId: string,
  ): Promise<ReadonlyArray<TranscriptArtifactSummary>>;
  listArtifactVersions(
    artifactId: string,
  ): Promise<ReadonlyArray<TranscriptArtifactVersion>>;
}

export async function hasCurrentTranscriptForAweme(
  reader: TranscriptArtifactReader,
  projectId: string,
  awemeId: string,
): Promise<boolean> {
  const artifacts = await reader.listProjectArtifacts(projectId);
  const candidates = artifacts.filter(
    (artifact) =>
      artifact.artifactType === "output_script" &&
      typeof artifact.currentVersionId === "string" &&
      artifact.currentVersionId.length > 0,
  );

  for (const artifact of candidates) {
    const versions = await reader.listArtifactVersions(artifact.id);
    const current = versions.find(
      (version) => version.id === artifact.currentVersionId,
    );
    if (current?.contentData?.awemeId === awemeId) return true;
  }
  return false;
}
