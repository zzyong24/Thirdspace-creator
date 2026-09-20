import {workbenchCommandRequestSchema, workbenchHostContextSchema, workbenchResultSchema, type WorkbenchCommandRequest, type WorkbenchHostContext, type WorkbenchResult} from '@creatoros/contract/agent-workbench';

/** The native host owns runtime resolution, OS confinement, process tree and receipt storage. */
export interface CommandPort {
  run(context: WorkbenchHostContext, request: WorkbenchCommandRequest): Promise<unknown>;
  status(context: WorkbenchHostContext): Promise<unknown>;
  cancel(context: WorkbenchHostContext): Promise<unknown>;
}

export function createCommandHost(port: CommandPort) {
  const checked = async (context: WorkbenchHostContext, call: () => Promise<unknown>): Promise<WorkbenchResult> => {
    const result = workbenchResultSchema.parse(await call());
    if (result.operationId !== context.operationId) throw new Error('命令宿主回执 operationId 不匹配');
    return result;
  };
  return {
    run: async (trustedContext: unknown, modelRequest: unknown): Promise<WorkbenchResult> => {
      const context = workbenchHostContextSchema.parse(trustedContext);
      const request = workbenchCommandRequestSchema.parse(modelRequest);
      return checked(context, () => port.run(context, request));
    },
    status: async (trustedContext: unknown): Promise<WorkbenchResult> => {
      const context = workbenchHostContextSchema.parse(trustedContext);
      return checked(context, () => port.status(context));
    },
    cancel: async (trustedContext: unknown): Promise<WorkbenchResult> => {
      const context = workbenchHostContextSchema.parse(trustedContext);
      return checked(context, () => port.cancel(context));
    },
  };
}
