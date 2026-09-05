import {
  topicReadReservationSchema,
  topicReadReceiptSchema,
  type TopicReadReceipt,
  type WorkerPort,
} from "@creatoros/contract/execution-worker";
import { GenerationFailure } from "./generation-error";
import { assertUrlAllowed } from "../runtime/browser/url-guard";
import type { TopicReadTarget, TopicReadData } from "./topic-worker-pipeline";
const resources = new Set<{ close(): Promise<void> }>();
export const closeTopicWorkerResources = () =>
  Promise.all([...resources].map((resource) => resource.close()));
/** 专用确定性读取协议，复用浏览器执行适配器但不伪造Agent模型工具调用。 */
export function createTopicWorkerReads(deps: {
  signal: AbortSignal;
  call(
    port: WorkerPort,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<unknown>;
}) {
  const { signal } = deps;
  const host = async (port: WorkerPort, input: unknown, admission = true) => {
    try {
      return await deps.call(port, input, admission ? signal : undefined);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GenerationFailure) throw error;
      if (
        error instanceof Error &&
        error.message === "EXECUTION_BUDGET_EXHAUSTED"
      )
        throw new GenerationFailure("failed", "EXECUTION_BUDGET_EXHAUSTED");
      if (error instanceof Error && error.message === "HOST_PORT_REJECTED")
        throw new GenerationFailure("failed", "TOPIC_READ_ADMISSION_REJECTED");
      throw new GenerationFailure(
        "unknown_result",
        "TOPIC_READ_RECEIPT_UNKNOWN",
      );
    }
  };
  let starting:
    | Promise<
        ReturnType<
          (typeof import("./research-worker-tools"))["createResearchWorkerTools"]
        >
      >
    | undefined;
  const getTools = () =>
    (starting ??= (async () => {
      const { createResearchWorkerTools } =
        await import("./research-worker-tools");
      return createResearchWorkerTools({
        signal,
        call: deps.call,
        sessionAccess: {
          read: (callId, _s) => host("readTopicBrowserSession", { callId }),
          save: (input, s) => deps.call("saveTopicBrowserSession", input, s),
        },
        onRead: async (_id, observation) => ({
          status: "ok",
          summary: "已读取冻结信源正文",
          evidence: [],
          data: { observation },
          error: null,
          continuation: null,
          sideEffect: "none",
        }),
      });
    })());
  const close = async () => {
    const tools = await starting;
    await tools?.close();
    resources.delete(resource);
  };
  const resource = { close };
  resources.add(resource);
  const readRss = async (url: string) => {
    let current = url;
    for (let redirect = 0; redirect < 6; redirect++) {
      signal.throwIfAborted();
      await assertUrlAllowed(current);
      signal.throwIfAborted();
      const response = await fetch(current, {
        redirect: "manual",
        headers: {
          Accept:
            "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("RSS_REDIRECT_INVALID");
        current = new URL(location, current).href;
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("RSS_HTTP_FAILED");
      }
      const reader = response.body?.getReader();
      if (!reader) return { sourceUrl: current, title: "", text: "" };
      const decoder = new TextDecoder();
      let text = "";
      try {
        while (true) {
          signal.throwIfAborted();
          const chunk = await reader.read();
          if (chunk.done) break;
          text += decoder.decode(chunk.value, { stream: true });
          if (text.length > 1500000) throw new Error("RSS_BODY_TOO_LARGE");
        }
        text += decoder.decode();
      } finally {
        await reader.cancel().catch(() => {});
      }
      return { sourceUrl: current, title: "", text };
    }
    throw new Error("RSS_REDIRECT_LIMIT");
  };
  return {
    close,
    async read(target: TopicReadTarget): Promise<TopicReadData | null> {
      for (let ordinal = 1; ordinal <= 2; ordinal++) {
        signal.throwIfAborted();
        const reserved = topicReadReservationSchema.parse(
          await host("reserveTopicRead", { target, ordinal }),
        );
        let receipt: TopicReadReceipt;
        if (reserved.status === "settled" && reserved.receipt)
          receipt = reserved.receipt;
        else {
          if (reserved.status !== "reserved")
            throw new GenerationFailure(
              "unknown_result",
              "TOPIC_READ_REQUIRES_RECONCILIATION",
            );
          await host("startTopicRead", { callId: reserved.callId });
          signal.throwIfAborted();
          if (reserved.request.kind === "rss") {
            try {
              receipt = {
                kind: "rss",
                status: "ok",
                data: await readRss(reserved.request.url),
              };
            } catch {
              signal.throwIfAborted();
              receipt = {
                kind: "rss",
                status: "error",
                error: { code: "TRANSIENT", retryable: true },
              };
            }
          } else {
            const output = await (
              await getTools()
            ).execute(
              reserved.request.kind === "search" ? "web.search" : "web.read",
              reserved.request.kind === "search"
                ? { query: reserved.request.query, count: 8 }
                : { url: reserved.request.url },
              { callId: reserved.callId, signal },
            );
            signal.throwIfAborted();
            if (output.status === "ok") {
              const data = output.data as Record<string, unknown>;
              if (reserved.request.kind === "search")
                receipt = topicReadReceiptSchema.parse({
                  kind: "search",
                  status: "ok",
                  data: { results: data.results },
                });
              else {
                const observation = data.observation as {
                  sourceUrl: string;
                  title: string;
                  fullText: string;
                };
                receipt = topicReadReceiptSchema.parse({
                  kind: "web",
                  status: "ok",
                  data: {
                    sourceUrl: observation.sourceUrl,
                    title: observation.title,
                    text: observation.fullText.slice(0, 1500000),
                  },
                });
              }
            } else {
              const code =
                (output.data as { recoveryState?: string } | undefined)
                  ?.recoveryState === "browser_runtime_unavailable"
                  ? "BROWSER_RUNTIME_UNAVAILABLE"
                  : output.error?.code === "needs_login"
                    ? "NEEDS_LOGIN"
                    : output.error?.code === "captcha"
                      ? "CAPTCHA"
                      : output.error?.code === "permission"
                        ? "PERMISSION"
                        : "TRANSIENT";
              receipt = {
                kind: reserved.request.kind,
                status: "error",
                error: { code, retryable: code === "TRANSIENT" },
              };
            }
          }
          // 外部读取已发生，控制到达后仍允许记录事实，禁止凭未知IPC重新读取。
          await host(
            "settleTopicRead",
            { callId: reserved.callId, receipt },
            false,
          );
        }
        signal.throwIfAborted();
        if (receipt.status === "ok")
          return receipt.kind === "search"
            ? { kind: "search", results: receipt.data.results }
            : { kind: receipt.kind, ...receipt.data };
        if (
          ["NEEDS_LOGIN", "CAPTCHA", "BROWSER_RUNTIME_UNAVAILABLE"].includes(
            receipt.error.code,
          )
        )
          throw new GenerationFailure(
            "waiting_user",
            receipt.error.code === "BROWSER_RUNTIME_UNAVAILABLE"
              ? "BROWSER_RUNTIME_UNAVAILABLE"
              : "NEEDS_LOGIN",
          );
        if (
          receipt.error.code !== "TRANSIENT" ||
          !receipt.error.retryable ||
          ordinal === 2
        )
          return null;
      }
      return null;
    },
  };
}
