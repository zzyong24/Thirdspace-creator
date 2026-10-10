import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { expect, test as base } from "@playwright/test";
import type { BrowserContext, Page, TestInfo } from "@playwright/test";
import {
  type ExternalNetworkAttempt,
  formatExternalNetworkAttempts,
  recordExternalNetworkAttempt,
} from "./network-policy";

const externalAttemptsByContext = new WeakMap<BrowserContext, ExternalNetworkAttempt[]>();
const verificationRoot = resolve(process.cwd(), "..", "docs", "verification", "t1207");
const screenshotRoot = resolve(verificationRoot, "screenshots");
const scenarioIndexPath = resolve(verificationRoot, "scenario-index.ndjson");

function scenarioScreenshotName(testId: string, file: string, titlePath: string[]): string {
  const spec = basename(file).replace(/\.spec\.[^.]+$/, "");
  const title = titlePath
    .slice(1)
    .join("-")
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "case";
  const stableId = createHash("sha256").update(testId).digest("hex");
  return `${spec}--${title}--${stableId}.png`;
}

function safeNetworkAttempt(attempt: ExternalNetworkAttempt) {
  try {
    const url = new URL(attempt.url);
    return { type: attempt.type, url: `${url.origin}${url.pathname}` };
  } catch {
    return { type: attempt.type, url: "invalid-url" };
  }
}

function usablePage(contextPages: Page[], primary: Page): Page | null {
  const openPages = contextPages.filter((page) => !page.isClosed());
  const navigatedPages = openPages.filter((page) => page.url() !== "about:blank");
  return navigatedPages.at(-1) ?? (primary.isClosed() ? null : primary);
}

async function writeScenarioEvidence(
  page: Page,
  context: BrowserContext,
  testInfo: TestInfo,
): Promise<void> {
  mkdirSync(screenshotRoot, { recursive: true });
  const screenshotName = scenarioScreenshotName(
    testInfo.testId,
    testInfo.file,
    testInfo.titlePath,
  );
  const screenshotPath = resolve(screenshotRoot, screenshotName);
  const capturedPage = usablePage(context.pages(), page);
  const attempts = (externalAttemptsByContext.get(context) ?? []).map(safeNetworkAttempt);
  let screenshotStatus: "captured" | "page-closed" | "error" = "page-closed";
  let screenshotError: string | null = null;
  const url = capturedPage?.url() ?? null;
  const viewport = capturedPage?.viewportSize() ?? null;

  if (capturedPage) {
    try {
      await capturedPage.screenshot({
        path: screenshotPath,
        animations: "disabled",
        caret: "hide",
      });
      await testInfo.attach(`t1207-${testInfo.testId}`, {
        path: screenshotPath,
        contentType: "image/png",
      });
      screenshotStatus = "captured";
    } catch (error) {
      screenshotStatus = "error";
      screenshotError = error instanceof Error ? error.stack ?? error.message : String(error);
    }
  }

  const record = {
    schemaVersion: 1,
    testId: testInfo.testId,
    titlePath: testInfo.titlePath,
    title: testInfo.title,
    spec: relative(resolve(process.cwd(), ".."), testInfo.file),
    url,
    viewport,
    status:
      screenshotStatus === "error" || attempts.length > 0
        ? "failed"
        : testInfo.status ?? "unknown",
    acceptanceStatus:
      screenshotStatus === "captured" && attempts.length === 0 && testInfo.status === "passed"
        ? "pass"
        : "review",
    expectedStatus: testInfo.expectedStatus,
    retry: testInfo.retry,
    screenshot: screenshotStatus === "captured" ? `screenshots/${screenshotName}` : null,
    screenshotStatus,
    screenshotError,
    pageClosedBeforeCapture: !capturedPage,
    externalNetworkAttempts: attempts,
    errors: testInfo.errors.map(({ message, stack }) => ({ message, stack })),
  };
  appendFileSync(scenarioIndexPath, `${JSON.stringify(record)}\n`, "utf8");

  if (screenshotStatus === "error") {
    throw new Error(`T-1207 截图钩子失败：${testInfo.titlePath.join(" › ")}\n${screenshotError}`);
  }
}

export const test = base.extend({
  context: async ({ context }, provide) => {
    const externalNetworkAttempts: ExternalNetworkAttempt[] = [];
    externalAttemptsByContext.set(context, externalNetworkAttempts);

    await context.route("**/*", async (route) => {
      const url = route.request().url();

      if (
        recordExternalNetworkAttempt(externalNetworkAttempts, "http", url)
      ) {
        await route.abort("blockedbyclient");
        return;
      }

      await route.continue();
    });

    await context.routeWebSocket("**/*", async (webSocket) => {
      const url = webSocket.url();

      if (
        recordExternalNetworkAttempt(
          externalNetworkAttempts,
          "websocket",
          url,
        )
      ) {
        await webSocket.close({
          code: 1008,
          reason: "External network requests are disabled in browser tests.",
        });
        return;
      }

      webSocket.connectToServer();
    });

    await provide(context);

    if (externalNetworkAttempts.length > 0) {
      throw new Error(
        formatExternalNetworkAttempts(externalNetworkAttempts),
      );
    }
    externalAttemptsByContext.delete(context);
  },
  t1207ScenarioCapture: [
    async ({ page, context }, provide, testInfo) => {
      let testError: unknown;
      try {
        await provide();
      } catch (error) {
        testError = error;
      }

      let captureError: unknown;
      try {
        await writeScenarioEvidence(page, context, testInfo);
      } catch (error) {
        captureError = error;
      }

      if (testError && captureError) {
        throw new AggregateError(
          [testError, captureError],
          "测试与 T-1207 截图钩子均失败；两项错误均保留。",
        );
      }
      if (captureError) throw captureError;
      if (testError) throw testError;
    },
    { auto: true },
  ],
});

export { expect };
