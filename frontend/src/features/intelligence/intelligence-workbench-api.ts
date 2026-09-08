import { client } from "@/lib/contract-client";
import { createHttpTransport } from "@/lib/http-transport";
import { ENDPOINTS,requestListWithMeta } from "@creatoros/contract";
import type { RadarApi,RadarItemDetail,RadarItemRow,RadarRun,RadarRunEvent,RadarSource } from "./intelligence-workbench-types";
const radarTransport = createHttpTransport();

export function defaultApi(): RadarApi {
  return {
    listCollectors: (input) =>
      client.listIntelligenceCollectors({
        params: undefined,
        query: input,
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
        body: input,
      }),
    previewWeb: (input) =>
      client.previewIntelligenceWeb({
        params: undefined,
        query: undefined,
        body: { ...input, instruction: input.instruction },
      }),
    listFavoriteFolders: (input) =>
      client.listIntelligenceFavoriteFolders({
        params: undefined,
        query: input,
        body: undefined,
      }) as unknown as Promise<
        Array<{ id: string; name: string; itemCount: number | null }>
      >,
    createCollection: (input) =>
      client.createIntelligenceCollection({
        params: undefined,
        query: undefined,
        body: input,
      }),
    createSource: (input) =>
      client.createIntelligenceSource({
        params: undefined,
        query: undefined,
        body: input as never,
      }),
    updateSource: (input) =>
      client.updateIntelligenceSource({
        params: { sourceId: input.sourceId },
        query: undefined,
        body: {
          monitorEnabled: input.monitorEnabled,
          syncPolicy: input.syncPolicy,
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
        body: input,
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
      client.loginDouyin({
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
            accountId: input.accountId,
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
        body: input,
      }),
    confirmTopic: (input) =>
      client.confirmIntelligenceTopic({
        params: { transformId: input.transformId },
        query: undefined,
        body: {
          editedCandidate: input.editedCandidate,
          idempotencyKey: input.idempotencyKey,
        },
      }),
    promoteCandidate: (input) =>
      client.promoteCandidate({
        params: { candidateId: input.candidateId },
        query: undefined,
        body: {},
      }),
  };
}

