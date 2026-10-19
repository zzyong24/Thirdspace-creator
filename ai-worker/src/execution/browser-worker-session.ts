import {executionTimeoutMs, completionWaitMs} from "@creatoros/contract/timeout-policy";
import { randomUUID } from "node:crypto";
import type { Page, JSHandle } from "@playwright/test";
import {
  browserActInputSchema,
  browserObservationSchema,
  type BrowserActInput,
  type BrowserObservation,
  type AgenticToolOutcome,
} from "@creatoros/contract/execution-worker";
export type BrowserWorkerAction = BrowserActInput;
type Observation = BrowserObservation;
/** 固定DOM程序与真实节点引用；调用方必须在context层安装导航/网络守卫。 */
export function createBrowserWorkerSession(deps: {
  page: Page;
  sessionId: string;
  guardUrl: (url: string) => Promise<void>;
}) {
  const { page, sessionId, guardUrl } = deps;
  page.setDefaultTimeout?.(executionTimeoutMs());
  page.setDefaultNavigationTimeout?.(executionTimeoutMs());
  let tracker: JSHandle<any> | undefined,
    latest: Observation | undefined,
    closed = false;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn, fn);
    tail = result.catch(() => {});
    return result;
  };
  const bounded = async <T>(
    operation: () => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> => {
    signal.throwIfAborted();
    const promise = operation();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: () => void = () => {};
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          abort = () => reject(new Error("cancelled"));
          signal.addEventListener("abort", abort, { once: true });
          timer = setTimeout(() => reject(new Error("deadline")), completionWaitMs([executionTimeoutMs()]));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  };
  const ensure = async () => {
    if (tracker) {
      try {
        if (await tracker.evaluate((t) => t.document === document)) return;
      } catch {}
      await tracker.dispose().catch(() => {});
    }
    tracker = await page.evaluateHandle(() => {
      const t: any = {
        document,
        url: location.href,
        revision: 0,
        nodes: [],
        observationId: "",
        observedRevision: 0,
      };
      t.observer = new MutationObserver(() => {
        t.revision++;
      });
      t.observer.observe(document, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
      });
      return t;
    });
  };
  const observeInternal = async (signal: AbortSignal): Promise<Observation> => {
    signal.throwIfAborted();
    await bounded(() => guardUrl(page.url()), signal);
    signal.throwIfAborted();
    await bounded(() => ensure(), signal);
    const observationId = randomUUID();
    const data = await bounded(
      () =>
        tracker!.evaluate(
          (t, args) => {
            if (t.observer.takeRecords().length) t.revision++;
            const nodes = Array.from(
              document.querySelectorAll<HTMLElement>(
                'a[href],button,input,textarea,select,[role],[contenteditable="true"],summary',
              ),
            )
              .filter((el) => {
                const box = el.getBoundingClientRect(),
                  style = getComputedStyle(el);
                return (
                  box.width > 0 &&
                  box.height > 0 &&
                  style.visibility !== "hidden" &&
                  style.display !== "none"
                );
              })
              .slice(0, 200);
            t.nodes = nodes.map((node) => ({
              node,
              state:
                node.outerHTML +
                "|" +
                ("value" in node ? String(node.value) : ""),
            }));
            t.observationId = args.observationId;
            t.observedRevision = t.revision;
            t.url = location.href;
            return {
              sessionId: args.sessionId,
              observationId: args.observationId,
              url: location.href,
              title: document.title.slice(0, 1000),
              text: (document.body?.innerText ?? "").slice(0, 12000),
              elements: nodes.map((node, index) => ({
                targetRef: `${args.observationId}:${index}`,
                role: (
                  node.getAttribute("role") ||
                  (
                    {
                      A: "link",
                      BUTTON: "button",
                      INPUT: "textbox",
                      TEXTAREA: "textbox",
                      SELECT: "combobox",
                      SUMMARY: "button",
                    } as Record<string, string>
                  )[node.tagName] ||
                  "element"
                ).slice(0, 128),
                name: (
                  node.getAttribute("aria-label") ||
                  node.getAttribute("title") ||
                  ("labels" in node
                    ? Array.from((node as HTMLInputElement).labels ?? [])
                        .map((label) => label.textContent)
                        .join(" ")
                    : "") ||
                  node.innerText ||
                  ""
                )
                  .trim()
                  .slice(0, 500),
              })),
            };
          },
          { sessionId, observationId },
        ),
      signal,
    );
    await bounded(() => guardUrl(data.url), signal);
    signal.throwIfAborted();
    latest = browserObservationSchema.parse(data);
    return latest;
  };
  const outcome = (
    observation: Observation | undefined,
    code: NonNullable<AgenticToolOutcome["error"]>["code"] | null,
    sideEffect: AgenticToolOutcome["sideEffect"] = "none",
    mechanism?: string,
  ): AgenticToolOutcome => ({
    status:
      code === "needs_login" || code === "captcha" || code === "permission"
        ? "blocked"
        : code
          ? "error"
          : "ok",
    summary:
      code === "stale_observation"
        ? "页面已变化，旧动作未执行，请使用新观察。"
        : code
          ? "浏览器操作未确认完成，请核对最新观察。"
          : mechanism
            ? "已派发DOM事件；是否达到业务目标请依据新观察判断。"
            : "已读取当前页面观察。",
    evidence: observation
      ? [
          {
            sourceUrl: observation.url,
            title: observation.title,
            text: observation.text,
          },
        ]
      : [],
    data: JSON.parse(
      JSON.stringify({
        ...(observation ? { observation } : {}),
        ...(mechanism
          ? { execution: { mechanism, trusted: false, eventDispatched: true } }
          : {}),
      }),
    ),
    error: code
      ? {
          code,
          retryable: code === "stale_observation" || code === "transient",
          recovery:
            code === "unknown_commit"
              ? "先核对页面与持久执行状态，不得重发同一动作。"
              : "重新观察后再规划操作。",
        }
      : null,
    continuation: null,
    sideEffect,
  });
  const safeObserve = async (signal: AbortSignal) => {
    try {
      return await observeInternal(signal);
    } catch {
      return undefined;
    }
  };
  return {
    observe(signal: AbortSignal) {
      return serial(async () => {
        if (closed) return outcome(undefined, "cancelled");
        try {
          return outcome(await observeInternal(signal), null);
        } catch {
          return outcome(undefined, signal.aborted ? "cancelled" : "transient");
        }
      });
    },
    act(input: BrowserWorkerAction, signal: AbortSignal) {
      return serial(async () => {
        let issued = false,
          mechanism: string | undefined,
          guarding = false;
        try {
          if (closed || signal.aborted) return outcome(undefined, "cancelled");
          const parsed = browserActInputSchema.safeParse(input);
          if (!parsed.success)
            return outcome(await safeObserve(signal), "invalid_input");
          input = parsed.data;
          if (
            input.sessionId !== sessionId ||
            !latest ||
            input.observationId !== latest.observationId
          )
            return outcome(await safeObserve(signal), "stale_observation");
          if (
            input.targetRef &&
            !latest.elements.some(
              (element) => element.targetRef === input.targetRef,
            )
          )
            return outcome(await safeObserve(signal), "invalid_input");
          if (
            !["navigate", "click", "fill", "wait", "extract"].includes(
              input.action,
            ) ||
            (input.action === "navigate" && !input.value) ||
            (input.action === "fill" && typeof input.value !== "string") ||
            (["click", "fill"].includes(input.action) && !input.targetRef) ||
            (input.action === "wait" && !input.targetRef && !input.value)
          )
            return outcome(await safeObserve(signal), "invalid_input");
          if (
            input.action === "navigate" ||
            (input.action === "wait" && input.value)
          ) {
            const target = new URL(input.value!);
            if (!["http:", "https:"].includes(target.protocol))
              return outcome(await safeObserve(signal), "invalid_input");
            input = { ...input, value: target.href };
            guarding = true;
            await bounded(() => guardUrl(target.href), signal);
            guarding = false;
          }
          guarding = true;
          await bounded(() => guardUrl(page.url()), signal);
          guarding = false;
          signal.throwIfAborted();
          if (page.url() !== latest.url)
            return outcome(await safeObserve(signal), "stale_observation");
          if (input.action === "click" && input.targetRef) {
            const destination = await bounded(
              () =>
                tracker!.evaluate((t, ref) => {
                  const prefix = t.observationId + ":";
                  if (!ref || !ref.startsWith(prefix)) return null;
                  const node = t.nodes[Number(ref.slice(prefix.length))]
                    ?.node as HTMLElement | undefined;
                  return (
                    node?.closest<HTMLAnchorElement>("a[href]")?.href ??
                    ((node instanceof HTMLButtonElement ||
                      node instanceof HTMLInputElement) &&
                    node.form
                      ? node.formAction || node.form.action
                      : null)
                  );
                }, input.targetRef),
              signal,
            );
            if (destination) {
              guarding = true;
              await bounded(() => guardUrl(destination), signal);
              guarding = false;
            }
          }
          signal.throwIfAborted();
          issued = input.action === "click" || input.action === "fill";
          const result = await bounded(
            () =>
              tracker!.evaluate((t, action) => {
                if (t.observer.takeRecords().length) t.revision++;
                const stale =
                  t.document !== document ||
                  t.url !== location.href ||
                  t.observationId !== action.observationId ||
                  t.revision !== t.observedRevision ||
                  t.nodes.some(
                    (entry: any) =>
                      !entry.node.isConnected ||
                      entry.state !==
                        entry.node.outerHTML +
                          "|" +
                          ("value" in entry.node
                            ? String(entry.node.value)
                            : ""),
                  );
                if (stale) return { stale: true, issued: false };
                let node: HTMLElement | undefined;
                if (action.targetRef) {
                  const prefix = t.observationId + ":";
                  const index = action.targetRef.startsWith(prefix)
                    ? Number(action.targetRef.slice(prefix.length))
                    : -1;
                  node =
                    Number.isInteger(index) &&
                    index >= 0 &&
                    action.targetRef === prefix + String(index)
                      ? t.nodes[index]?.node
                      : undefined;
                  if (!node) return { invalid: true, issued: false };
                }
                if (action.action === "click" || action.action === "fill") {
                  if (
                    !node ||
                    node.matches(":disabled") ||
                    node.getAttribute("aria-disabled") === "true"
                  )
                    return { invalid: true, issued: false };
                  if (
                    action.action === "fill" &&
                    !(
                      node instanceof HTMLInputElement ||
                      node instanceof HTMLTextAreaElement
                    )
                  )
                    return { invalid: true, issued: false };
                  if (
                    action.action === "fill" &&
                    node instanceof HTMLInputElement &&
                    node.type === "password"
                  )
                    return { blocked: "needs_login" as const, issued: false };
                  if (
                    action.action === "fill" &&
                    node instanceof HTMLInputElement &&
                    node.type === "file"
                  )
                    return { blocked: "permission" as const, issued: false };
                  if (
                    action.action === "fill" &&
                    (node as HTMLInputElement).readOnly
                  )
                    return { invalid: true, issued: false };
                  // 校验与事件派发同一JS回合；不得把此synthetic事件声称为trusted用户手势。
                  if (action.action === "click") node.click();
                  else {
                    const proto =
                      node instanceof HTMLInputElement
                        ? HTMLInputElement.prototype
                        : HTMLTextAreaElement.prototype;
                    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(
                      node,
                      action.value,
                    );
                    node.dispatchEvent(new Event("input", { bubbles: true }));
                    node.dispatchEvent(new Event("change", { bubbles: true }));
                  }
                  return {
                    issued: true,
                    mechanism:
                      action.action === "click"
                        ? "dom_click"
                        : "native_value_setter",
                  };
                }
                if (action.action === "navigate") {
                  if (location.href === action.value) return { issued: false };
                  location.assign(action.value!);
                  return { issued: true, mechanism: "location_assign" };
                }
                if (action.action === "extract" && node) {
                  const text = node.innerText ?? node.textContent ?? "";
                  return {
                    issued: false,
                    extraction: {
                      targetRef: action.targetRef!,
                      text: text.slice(0, 12000),
                      totalChars: text.length,
                      truncated: text.length > 12000,
                      sourceUrl: location.href,
                    },
                  };
                }
                return { issued: false };
              }, input),
            signal,
          );
          issued = !!result.issued;
          mechanism = result.mechanism;
          if (result.stale)
            return outcome(await safeObserve(signal), "stale_observation");
          if (result.invalid)
            return outcome(await safeObserve(signal), "invalid_input");
          if (result.blocked)
            return outcome(await safeObserve(signal), result.blocked);
          if (input.action === "navigate" && issued)
            await bounded(
              () =>
                page.waitForURL((url) => url.href !== latest!.url, {
                  timeout: executionTimeoutMs(),
                  waitUntil: "domcontentloaded",
                }),
              signal,
            );
          if (input.action === "wait") {
            if (input.value)
              await bounded(
                () =>
                  page.waitForURL((url) => url.href === input.value, {
                    timeout: executionTimeoutMs(),
                    waitUntil: "domcontentloaded",
                  }),
                signal,
              );
            else
              await bounded(
                () =>
                  tracker!.evaluate(async (t, ref) => {
                    const index = Number(
                        ref!.slice((t.observationId + ":").length),
                      ),
                      node = t.nodes[index]?.node;
                    if (!node) return;
                    await new Promise<void>((resolve, reject) => {
                      const started = Date.now();
                      const check = () => {
                        if (!node.isConnected)
                          return reject(new Error("stale"));
                        const box = node.getBoundingClientRect();
                        if (box.width > 0 && box.height > 0) return resolve();
                        if (Date.now() - started > 120_000)
                          return reject(new Error("timeout"));
                        setTimeout(check, 25);
                      };
                      check();
                    });
                  }, input.targetRef),
                signal,
              );
          }
          const observation = await observeInternal(signal);
          const output = outcome(
            observation,
            null,
            issued ? "committed" : "none",
            mechanism,
          );
          if (result.extraction) {
            output.data = JSON.parse(
              JSON.stringify({ observation, extraction: result.extraction }),
            );
            output.evidence.push({
              sourceUrl: result.extraction.sourceUrl,
              title: observation.title,
              text: result.extraction.text,
            });
          }
          return output;
        } catch (error) {
          const uncertain =
            issued && (input.action === "click" || input.action === "fill");
          if (uncertain) latest = undefined;
          if (
            signal.aborted ||
            (error instanceof Error &&
              ["deadline", "cancelled"].includes(error.message))
          ) {
            closed = true;
            latest = undefined;
            await page.close({ runBeforeUnload: false }).catch(() => {});
          }
          const observation = await safeObserve(signal);
          return outcome(
            observation,
            uncertain
              ? "unknown_commit"
              : signal.aborted
                ? "cancelled"
                : guarding
                  ? "permission"
                  : "transient",
            uncertain ? "unknown" : "none",
          );
        }
      });
    },
    /** 只清理观察器/句柄。取消或超时已提交操作会关闭本page；context与浏览器子树仍由宿主关闭。 */
    close() {
      closed = true;
      return serial(async () => {
        const handle = tracker;
        tracker = undefined;
        try {
          if (handle)
            await bounded(
              () => handle.evaluate((t) => t.observer.disconnect()),
              new AbortController().signal,
            );
        } catch {}
        await handle?.dispose().catch(() => {});
      });
    },
  };
}
