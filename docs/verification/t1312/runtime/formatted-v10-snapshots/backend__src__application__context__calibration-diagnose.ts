import type {RequestContext} from "@creatoros/contract";

/** 校准业务读取；沿原预测锁定与归属规则。 */
export function createCalibrationDiagnoseReaders(ports:{projectsService: Pick<ReturnType<typeof import("../../modules/projects").createProjectsService>,"getOutput">;
publishingService: Pick<ReturnType<typeof import("../../modules/publishing").createPublishingService>,"getPublication" | "listRevisions">;
calibrationService: Pick<ReturnType<typeof import("../../modules/calibration").createCalibrationService>,"ensureDefaultRubric">;
readCurrentScript:(ctx:RequestContext,projectId:string)=>ReturnType<ReturnType<typeof import("./current-artifact").createCurrentArtifactReader>>;
}){
const {projectsService,publishingService,calibrationService,readCurrentScript}=ports;
return {
              subject: {
                get: async (
                  c: RequestContext,
                  subjectType: string,
                  subjectId: string,
                ) => {
                  if (subjectType === "publication") {
                    // publication → its title + current revision body (the 文稿 the agent
                    // scores). A publication with no revision keeps "" (尽力诊断).
                    const pub = await publishingService.getPublication(
                      c,
                      subjectId,
                    );
                    const revisions = await publishingService.listRevisions(
                      c,
                      subjectId,
                      { limit: 1, offset: 0 },
                    );
                    const rev = revisions[0];
                    return {
                      title: rev?.title || `${pub.platform} 发布`,
                      scriptText: rev?.description ?? "",
                    };
                  }
                  const output = await projectsService.getOutput(c, subjectId);
                  const current = await readCurrentScript(c, output.projectId);
                  if(current && current.projectId!==output.projectId)throw new Error("诊断原稿与作品项目不符");
                  return { title: output.title, scriptText: current?.fullText ?? "" };
                },
              },
              rubric: {
                current: async (c: RequestContext) => {
                  // The creator's default 变现加权 rubric (canonical seed id) — its current
                  // version's dimensions are exactly what the agent scores. 这里固定读取当前默认版本，不接受模型或客户端覆盖评分标准。
                  // [T-332 S2] per-account 默认 rubric(当前号的 canonical id)。
                  const v = (await calibrationService.ensureDefaultRubric(c)).currentVersion;
                  return {
                    rubricVersionId: v.id,
                    dimensions: v.dimensions.map((d) => ({
                      key: d.key,
                      label: d.label,
                      description: d.description,
                    })),
                  };
                },
              },
  };
}
