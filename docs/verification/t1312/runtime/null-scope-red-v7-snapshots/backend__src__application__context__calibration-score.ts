import type {RequestContext} from "@creatoros/contract";
import {OwnershipError} from "../../modules/projects";
/** 校准业务读取；沿原预测锁定与归属规则。 */
export function createCalibrationScoreReaders(ports:{projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"getOutputOwnerSummary" | "getOutput">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"getPublication" | "listRevisions" | "listPublications">;
analyticsService: Pick<ReturnType<typeof import("../../modules/analytics").createAnalyticsService>,"getPublicationAnalytics">;
calibrationService: Pick<ReturnType<typeof import("../../modules/calibration").createCalibrationService>,"getPrediction" | "getRubricVersion">;}){
const {projectsService,publishingService,analyticsService,calibrationService}=ports;
return {
              prediction: {
                get: async (c: RequestContext, predictionId: string) => {
                  // The locked prediction's 维度评分约定 (predictedConversion.dimensions =
                  // [{key,score,...}]) + subject. Ownership-gated via the calibration public
                  // service (cross-user / unknown → 404). The rubric version resolves each
                  // dimension's 中文 label (取不到回退 key).
                  const pred = await calibrationService.getPrediction(
                    c,
                    predictionId,
                  );
                  if(pred.status!=="locked")throw new Error("请先锁定盲预测，再生成真实表现评分");
                  if(pred.subjectType==="publication")await publishingService.getPublication(c,pred.subjectId);
                  else if(!await projectsService.getOutputOwnerSummary(c,pred.subjectId))throw new OwnershipError("评分作品不存在");
                  const conv = (pred.predictedConversion ?? {}) as {
                    dimensions?: Array<{ key?: unknown; score?: unknown }>;
                  };
                  const rawDims = Array.isArray(conv.dimensions)
                    ? conv.dimensions
                    : [];
                  // Resolve dimension labels from the prediction's rubric version (best-effort).
                  const labelByKey = new Map<string, string>();
                  try {
                    const version =
                      await calibrationService.getRubricVersion(c,pred.rubricVersionId);
                    for (const d of version.dimensions) {
                      labelByKey.set(d.key, d.label);
                    }
                  } catch {
                    /* label is decoration — fall back to key */
                  }
                  const dimensions = rawDims
                    .map((d) => {
                      const key = typeof d.key === "string" ? d.key : "";
                      const predicted =
                        typeof d.score === "number" && Number.isFinite(d.score)
                          ? d.score
                          : null;
                      return {
                        key,
                        label: labelByKey.get(key) ?? key,
                        predicted,
                      };
                    })
                    .filter((d) => d.key !== "");
                  // The subject's 标题 (the work being scored). For a publication, the latest
                  // revision title; for a content_output, its title. Best-effort — 取不到给空串。
                  let title = "";
                  try {
                    if (pred.subjectType === "publication") {
                      const revisions = await publishingService.listRevisions(
                        c,
                        pred.subjectId,
                        { limit: 1, offset: 0 },
                      );
                      title = revisions[0]?.title ?? "";
                    } else {
                      const output = await projectsService.getOutput(
                        c,
                        pred.subjectId,
                      );
                      title = output.title;
                    }
                  } catch {
                    /* title is decoration — 尽力评分 */
                  }
                  return {
                    status: pred.status,
                    subjectType: pred.subjectType,
                    subjectId: pred.subjectId,
                    title,
                    dimensions,
                  };
                },
              },
              metrics: {
                forSubject: async (
                  c: RequestContext,
                  subjectType: string,
                  subjectId: string,
                ) => {
                  // Real metrics live in analytics' metric_snapshots (rawMetrics jsonb with the
                  // platform payload: views/likes/comments/shares/favorites/finish_rate/...).
                  // For a publication, subjectId IS the publicationId; for a content_output,
                  // resolve its publication(s) via publishing first. Read the LATEST snapshot
                  // per publication (captured-at desc), merge numeric rawMetrics. No snapshot →
                  // [](honest: the runner then scores from title+定位 and says so).
                  const numericMetrics = (
                    raw: Record<string, unknown>,
                  ): Array<{ key: string; value: number }> =>
                    Object.entries(raw)
                      .filter(
                        ([, v]) =>
                          typeof v === "number" && Number.isFinite(v),
                      )
                      .map(([key, v]) => ({ key, value: v as number }));
                  const latestFor = async (
                    publicationId: string,
                  ): Promise<Array<{ key: string; value: number }>> => {
                    try {
                      const page =
                        await analyticsService.getPublicationAnalytics(
                          c,
                          publicationId,
                          1,
                          10,
                        );
                      const latest = page.rows
                        .slice()
                        .sort((a, b) =>
                          b.capturedAt.localeCompare(a.capturedAt),
                        )[0];
                      const raw = (latest?.rawMetrics ?? {}) as Record<
                        string,
                        unknown
                      >;
                      return numericMetrics(raw);
                    } catch {
                      return []; // a single publication's read failing → no metrics, never crash
                    }
                  };
                  let publicationIds: string[] = [];
                  if (subjectType === "publication") {
                    publicationIds = [subjectId];
                  } else {
                    try {
                      const pubs = await publishingService.listPublications(
                        c,
                        subjectId,
                        { limit: 20, offset: 0 },
                      );
                      publicationIds = pubs.map((p) => p.id);
                    } catch {
                      publicationIds = [];
                    }
                  }
                  // Merge metrics across the subject's publications (last写入 wins per key —
                  // a single-publication subject is the common case).
                  const merged = new Map<string, number>();
                  for (const pid of publicationIds) {
                    for (const m of await latestFor(pid)) {
                      merged.set(m.key, m.value);
                    }
                  }
                  return Array.from(merged.entries()).map(([key, value]) => ({
                    key,
                    value,
                  }));
                },
              },
  };
}
