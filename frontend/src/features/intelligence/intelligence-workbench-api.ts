
import { createHttpTransport } from "@/lib/http-transport";
import { createClient,ENDPOINTS,requestListWithMeta, executionTaskResourceV2 } from "@creatoros/contract";
import {radarAccountInput,radarTaskInScope} from "./intelligence-workbench-types";
import type { RadarScope,RadarApi,RadarItemDetail,RadarItemRow,RadarRun,RadarRunEvent,RadarSource } from "./intelligence-workbench-types";
const scopedInput=<T extends RadarScope>(input:T)=>{const rest={...input};delete rest.groupId;delete rest.accountId;return {...rest,...radarAccountInput(input)};};

export function defaultApi(scope?:RadarScope): RadarApi {
  const radarTransport=createHttpTransport("/api/v1",scope?.groupId?{groupId:scope.groupId}:scope);
  const client=createClient(ENDPOINTS,radarTransport);
  return {
    ensureProject: input=>client.ensureProject({params:undefined,query:undefined,body:input}),
    getProjectPreparation: projectId=>client.getProjectPreparation({params:{projectId},query:undefined,body:undefined}),
    async listShareImportTasks(input) {
      const rows: unknown = await client.listExecutionTasks({params: undefined, query: {...scopedInput(input), kind: "share_import", page: input.page ?? 1, pageSize: 100}, body: undefined});
      if (!Array.isArray(rows)) throw new Error("导入任务列表回执格式不正确，请刷新核对。");
      return rows.map(row => executionTaskResourceV2.parse(row)).filter(task => task.kind === "share_import" && radarTaskInScope(task,input) && task.ownerType === "item_import");
    },
    async commandTask(input){const result=await client.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[input.taskId],command:input.command,idempotencyKey:input.idempotencyKey}});if(!result.tasks.some(task=>task.id===input.taskId))throw new Error("任务操作回执不匹配，请刷新后核对。");},
    listCollectors: (input) =>
      client.listIntelligenceCollectors({
        params: undefined,
        query: scopedInput(input),
        body: undefined,
      }) as unknown as Promise<
        Array<{
          accountId: string;
          accountHandle: string;
          platform: "douyin";
        }>
      >,
    previewProfile: (input) =>
      client.previewIntelligenceProfile({
        params: undefined,
        query: undefined,
        body: scopedInput(input),
      }),
    previewWeb: (input) =>
      client.previewIntelligenceWeb({
        params: undefined,
        query: undefined,
        body: { ...scopedInput(input), instruction: input.instruction },
      }),
    listFavoriteFolders: (input) =>
      client.listIntelligenceFavoriteFolders({
        params: undefined,
        query: scopedInput(input),
        body: undefined,
      }) as unknown as Promise<
        Array<{ id: string; name: string; itemCount: number | null }>
      >,
    createCollection: (input) =>
      client.createIntelligenceCollection({
        params: undefined,
        query: undefined,
        body: scopedInput(input),
      }),
    createSource: (input) =>
      client.createIntelligenceSource({
        params: undefined,
        query: undefined,
        body: scopedInput(input) as never,
      }),
    updateSource: (input) =>
      client.updateIntelligenceSource({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: {
          ...(input.monitorEnabled === undefined ? {} : { monitorEnabled: input.monitorEnabled }),
          ...(input.syncPolicy === undefined ? {} : { syncPolicy: input.syncPolicy }),
          ...(input.collectorAccountId === undefined ? {} : { collectorAccountId: input.collectorAccountId }),
          expectedVersion: input.expectedVersion,
        },
      }) as Promise<RadarSource>,
    deleteSource: (input) =>
      client.deleteIntelligenceSource({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: { mode: input.mode, confirmToken: input.confirmToken },
      }),
    importDouyinShare: (input) =>
      client.importDouyinShareItem({
        params: undefined,
        query: undefined,
        body: scopedInput(input),
      }),
    startRun: (input) =>
      client.startIntelligenceRun({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: {
          trigger: "manual",
          idempotencyKey: input.idempotencyKey,
        },
      }),
    reconnectCollector: (input) =>
      createClient(ENDPOINTS,createHttpTransport("/api/v1",{groupId:scope?.groupId,accountId:input.collectorAccountId})).loginDouyin({
        params: undefined,
        query: undefined,
        body: {
          accountId: input.collectorAccountId,
          site:
            input.sourceType === "darkhorse_query"
              ? "douhot.douyin.com"
              : "douyin.com",
        },
      }) as Promise<{ loggedIn: boolean }>,
    listRuns: (sourceId) =>
      client.listIntelligenceRuns({
        params: { sourceId },
        query: { page: 1, pageSize: 20 },
        body: undefined,
      }) as unknown as Promise<RadarRun[]>,
    getRun: (runId) =>
      client.getIntelligenceRun({
        params: { runId },
        query: undefined,
        body: undefined,
      }) as Promise<{ run: RadarRun; events: RadarRunEvent[] }>,
    listItems: async (input) => {
      const page = input.page ?? 1;
      const pageSize = input.pageSize ?? 100;
      const result = await requestListWithMeta(
        radarTransport,
        ENDPOINTS.listIntelligenceItems,
        {
          params: undefined,
          query: {
            ...radarAccountInput(input),
            page,
            pageSize,
            sort: input.sort,
            ...(input.collectionId
              ? { collectionId: input.collectionId }
              : {}),
            ...(input.sourceId ? { sourceId: input.sourceId } : {}),
            ...(input.query ? { query: input.query } : {}),
            ...(input.transcriptState
              ? { transcriptState: input.transcriptState }
              : {}),
            ...(input.topicState ? { topicState: input.topicState } : {}),
          },
          body: undefined,
        },
      );
      return {
        items: result.data as RadarItemRow[],
        page: result.meta.page,
        pageSize: result.meta.pageSize,
        total: result.meta.total,
        hasMore:
          result.meta.page * result.meta.pageSize < result.meta.total,
      };
    },
    getItem: (itemId) =>
      client.getIntelligenceItem({
        params: { itemId },
        query: undefined,
        body: undefined,
      }) as Promise<RadarItemDetail>,
    enqueueTranscript: (input) =>
      client.enqueueIntelligenceTranscripts({
        params: undefined,
        query: undefined,
        body: {
          itemIds: [input.itemId],
          idempotencyKey: input.idempotencyKey,
        },
      }),
    uploadTranscript: async (input) => {
      const result = await client.uploadManualIntelligenceTranscript({
        params: undefined,
        query: undefined,
        body: input,
      });
      return result.transcript;
    },
    previewTopic: (input) =>
      client.previewIntelligenceTopic({
        params: undefined,
        query: undefined,
        // The shared contract is being extended to make positioningVersionId optional.
        body: input as unknown as Parameters<typeof client.previewIntelligenceTopic>[0]["body"],
      }),
    confirmTopic: (input) =>
      client.confirmIntelligenceTopic({
        params: { transformId: input.transformId },
        query: undefined,
        body: {
          ...("editedCandidate" in input ? { editedCandidate: input.editedCandidate } : {}),
          ...("editedDraftContentText" in input && input.editedDraftContentText !== undefined
            ? { editedDraftContentText: input.editedDraftContentText }
            : {}),
          idempotencyKey: input.idempotencyKey,
        } as unknown as Parameters<typeof client.confirmIntelligenceTopic>[0]["body"],
      }),
    promoteCandidate: (input) =>
      client.promoteCandidate({
        params: { candidateId: input.candidateId },
        query: undefined,
        body: {},
      }),
  };
}
