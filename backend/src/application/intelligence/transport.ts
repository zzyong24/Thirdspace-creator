import type {RequestContext,Transport} from "@creatoros/contract";
import {requireWorkspace} from "../../workspace-scope";
import {OwnershipError} from "../../modules/projects";
import {parseFeed} from "@creatoros/ai-worker";
/** 来源预检与提交后唤醒；资源访问由宿主端口提供。 */
export function createIntelligenceApplicationTransport(ports:{intelligenceBase:Transport;
assertWorkspaceReadable:(ctx:RequestContext)=>Promise<void>;
assertCollectorEligible:import("../../modules/intelligence/intelligence.service").IntelligenceService["assertCollectorEligible"];
getCollectorAccount:import("../../modules/platform-account").PlatformAccountService["getAccount"];
previewProfile:(collectorAccountId:string,externalAccountId:string,canonicalUrl:string)=>Promise<{externalAccountId:string;nickname:string;avatarUrl:string|null;canonicalUrl:string;visibleWorkCount:number|null}>;
readFavoriteFolders:(ctx:RequestContext,collectorAccountId:string)=>Promise<Array<{collectsId:string;name:string;totalCount:number}>>;
fetchIntelligenceFeed:(url:string,signal?:AbortSignal)=>Promise<{xml:string;finalUrl:string}>;
isSyndicationFeed:(xml:string)=>boolean;
readWeb:(ctx:RequestContext,url:string)=>Promise<{title:string;finalUrl:string;text:string;extractor:string}>;
isLoginRequiredError:(error:unknown)=>boolean;
wake:(kind:"share_import"|"transcribe"|"topic_preview"|"script_candidate")=>void;
canWakeTranscript:()=>boolean;
dispatchIntelligenceRun:(ctx:RequestContext,result:unknown)=>void;}):Transport {
const {intelligenceBase,assertWorkspaceReadable,assertCollectorEligible,previewProfile,readFavoriteFolders,fetchIntelligenceFeed,isSyndicationFeed,readWeb,isLoginRequiredError,wake,canWakeTranscript,dispatchIntelligenceRun}=ports;
return {
    async request(endpoint, input, ctx) {
      if (ctx && endpoint.id === "intelligence.sources.previewProfile") {
        const body = (input as {
          body?: {
            accountId?: string;
            collectorAccountId?: string;
            url?: string;
          };
        })?.body;
        requireWorkspace(ctx);await assertWorkspaceReadable(ctx);
        if (body?.accountId && body.accountId !== ctx.accountId) {
          throw new Error("Intelligence source not found");
        }
        const collectorAccountId = body?.collectorAccountId ?? "";
        const collector =
          await assertCollectorEligible(
            ctx,
            collectorAccountId,
          );
        if (
          collector.status !== "active" ||
          collector.platform !== "douyin"
        ) {
          throw new OwnershipError("采集账号不可用，请重新选择");
        }
        const url = new URL(body?.url ?? "");
        if (
          !/(^|\.)douyin\.com$/i.test(url.hostname) ||
          !url.pathname.match(/\/user\/([^/?#]+)/)
        ) {
          throw new Error("请输入完整的抖音博主主页链接");
        }
        const externalAccountId = decodeURIComponent(
          url.pathname.match(/\/user\/([^/?#]+)/)?.[1] ?? "",
        );
        const preview = await previewProfile(collectorAccountId, externalAccountId, url.toString());
        return {
          data: {
            platform: "douyin",
            ...preview,
          },
          meta: { requestId: ctx.requestId },
        };
      }
      if (ctx && endpoint.id === "intelligence.sources.previewWeb") {
        const body = (input as {
          body?: {
            accountId?: string;
            url?: string;
            instruction?: string;
            browserSessionRef?: string;
          };
        })?.body;
        requireWorkspace(ctx);await assertWorkspaceReadable(ctx);
        if (body?.accountId && body.accountId !== ctx.accountId) {
          throw new Error("Intelligence source not found");
        }
        const requestedUrl = new URL(body?.url ?? "").toString();
        try {
          const feed = await fetchIntelligenceFeed(requestedUrl);
          if (isSyndicationFeed(feed.xml)) {
            const rows = parseFeed(
              feed.xml,
              new URL(feed.finalUrl).hostname,
            );
            return {
              data: {
                type: "rss",
                title: new URL(feed.finalUrl).hostname,
                finalUrl: feed.finalUrl,
                samples: rows.slice(0, 3).map((row) => ({
                  title: row.title,
                  url: row.url,
                  summary: row.snippet || null,
                })),
                loginRequired: false,
                parser: "rss-or-atom-feed",
                browserSessionRef: body?.browserSessionRef ?? null,
              },
              meta: { requestId: ctx.requestId },
            };
          }
        } catch {
          // 不是公开 feed 时继续尝试受控浏览器正文预览；最终错误由该真实读取路径返回。
        }

        try {
          const read = await readWeb(ctx, requestedUrl);
          return {
            data: {
              type: "web",
              title: read.title || null,
              finalUrl: read.finalUrl,
              samples: [
                {
                  title: read.title,
                  url: read.finalUrl,
                  summary: read.text.trim().slice(0, 320) || null,
                },
              ],
              loginRequired: false,
              parser: `readable:${read.extractor}`,
              browserSessionRef: body?.browserSessionRef ?? null,
            },
            meta: { requestId: ctx.requestId },
          };
        } catch (error) {
          if (isLoginRequiredError(error)) {
            return {
              data: {
                type: "web",
                title: null,
                finalUrl: requestedUrl,
                samples: [],
                loginRequired: true,
                parser: "login-required",
                browserSessionRef: body?.browserSessionRef ?? null,
              },
              meta: { requestId: ctx.requestId },
            };
          }
          throw error;
        }
      }
      if (
        ctx &&
        endpoint.id === "intelligence.sources.listFavoriteFolders"
      ) {
        const query = (input as {
          query?: {
            accountId?: string;
            collectorAccountId?: string;
          };
        })?.query;
        requireWorkspace(ctx);await assertWorkspaceReadable(ctx);
        if (query?.accountId && query.accountId !== ctx.accountId) {
          // 已知是当前页面账号与收藏归属不一致；仍使用 404-class OwnershipError，
          // 但给本机用户可操作的收藏语义，避免 UI 只得到无关的 source not found。
          throw new OwnershipError("收藏账号与当前页面账号不一致");
        }
        const collectorAccountId = query?.collectorAccountId ?? "";
        const collector =
          await assertCollectorEligible(
            ctx,
            collectorAccountId,
          );
        if (
          collector.status !== "active" ||
          collector.platform !== "douyin"
        ) {
          throw new OwnershipError("采集账号不可用，请重新选择");
        }
        const folders = await readFavoriteFolders(ctx, collectorAccountId);
        return {
          data: folders.map((folder) => ({
            id: folder.collectsId,
            name: folder.name,
            itemCount: folder.totalCount,
          })),
          meta: {
            requestId: ctx.requestId,
            page: 1,
            pageSize: folders.length || 1,
            total: folders.length,
          },
        };
      }
      const result = await intelligenceBase.request(endpoint, input, ctx);
      if (
        ctx &&
        endpoint.id === "intelligence.items.importDouyinShare"
      ) {
        const task = (
          result as { data?: { task?: { id?: unknown; status?: unknown } } }
        ).data?.task;
        if (
          typeof task?.id === "string" &&
          task.status === "queued"
        ) {
          wake("share_import");
        }
      }
      if (
        ctx &&
        (endpoint.id === "intelligence.sources.create" ||
          endpoint.id === "intelligence.runs.start")
      ) {
        dispatchIntelligenceRun(ctx, result);
      }
      if (
        ctx &&
        endpoint.id === "intelligence.transcripts.enqueue" &&
        canWakeTranscript()
      ) {
        const tasks = (
          result as { data?: { tasks?: Array<{ id?: unknown }> } }
        ).data?.tasks;
        for (const task of tasks ?? []) {
          if (typeof task.id !== "string") continue;
          wake("transcribe");
        }
      }
      if (
        ctx &&
        endpoint.id === "intelligence.transforms.previewTopic"
      ) {
        const task = (
          result as { data?: { task?: { id?: unknown; status?: unknown } } }
        ).data?.task;
        if (
          typeof task?.id === "string" &&
          task.status === "queued"
        ) {
          wake("topic_preview");
        }
      }
      if (
        ctx &&
        endpoint.id === "projects.scripts.generateCandidate"
      ) {
        const task = (result as { data?: { id?: unknown; status?: unknown } })
          .data;
        if (typeof task?.id === "string" && task.status === "queued") {
          wake("script_candidate");
        }
      }
      return result;
    },
  };
}
