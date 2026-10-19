import {workbenchFileRequestSchema, workbenchHostContextSchema, workbenchResultSchema, type WorkbenchFileRequest, type WorkbenchHostContext, type WorkbenchResult} from '@creatoros/contract/agent-workbench';

/** The port is installed by the trusted execution host, never by a model tool argument. */
export interface TaskFilePort {
  invoke(context: WorkbenchHostContext, request: WorkbenchFileRequest): Promise<unknown>;
}

/** Frozen result schema has no currentVersion field; preserve it in a stable code. */
export function versionConflictResult(trustedContext: unknown, currentVersion: number): WorkbenchResult {
  const context = workbenchHostContextSchema.parse(trustedContext);
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 0) throw new Error('当前文件版本无效');
  return workbenchResultSchema.parse({
    operationId: context.operationId, status: 'failed', artifactRefs: [], progressCursor: null,
    error: {code: `version_conflict:${currentVersion}`, retryable: false, dispatched: false, nextAction: 'fix_input'},
  });
}

export function createTaskFiles(port: TaskFilePort) {
  return async (trustedContext: unknown, modelRequest: unknown): Promise<WorkbenchResult> => {
    const context = workbenchHostContextSchema.parse(trustedContext);
    const request = workbenchFileRequestSchema.parse(modelRequest);
    const result = workbenchResultSchema.parse(await port.invoke(context, request));
    if (result.operationId !== context.operationId) throw new Error('文件宿主回执 operationId 不匹配');
    return result;
  };
}
