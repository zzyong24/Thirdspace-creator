import {createBrowserTaskAuthorizationService} from "./browser-task-authorization.service";
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it, vi } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  executionTasks,
  executionCalls,
  knowledgeItems,
  knowledgeRevisions,
  knowledgeAdoptions,
  executionEvidence,
  eq,
} from "@creatoros/backend";
import {
  createKnowledgeProposalAdoptionService,
  createKnowledgeService,
  createKnowledgeRepository,
} from "../knowledge";
import { createBrowserSessionsService } from "../browser-sessions";
import { createAgenticProposalStagingService } from "../ai/agentic-proposal-staging.service";
import { createAgenticProposalAdoptionService } from "../ai/agentic-proposal-adoption.service";
import { createAiService } from "../ai/ai.service";
import { createAgenticWorkerDispatcher } from "../execution/model-worker-dispatcher";
import { createAgenticResearchTools } from "./agentic-research-tools";
import { createAgenticBusinessExecutionService } from "./agentic-business-execution.service";

it.each(["normal", "unknown"] as const)(
  "真实Pi跨进程浏览器：旧观察自修复、填写点击、证据与公共采纳 %s",
  async (mode) => {
    const directory = await mkdtemp(
      resolve("../ai-worker/node_modules/.browser-integration-"),
    );
    const entryPath = join(directory, "worker.cjs");
    execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import{build}from'esbuild';await build({entryPoints:[process.argv[1]],outfile:process.argv[2],bundle:true,platform:'node',target:'node24',format:'cjs',external:['@playwright/test','jsdom','@mozilla/readability']});`,
        resolve("src/modules/ai-runtime/agentic-browser-worker.fixture.ts"),
        entryPath,
      ],
      { cwd: resolve("../ai-worker"), stdio: "pipe" },
    );
    const f = await createDb(),
      now = () => new Date().toISOString(),
      nextId = (prefix: string) => `${prefix}-${randomUUID()}`;
    const ctx = {
      userId: "research-worker",
      accountId: "research-account",
      requestId: "test",
      source: "user" as const,
    };
    const noExternal = async (): Promise<never> => {
      throw new Error("未授权外部能力");
    };
    const knowledge = createKnowledgeProposalAdoptionService(f.db, now);
    const adoption = createAgenticProposalAdoptionService(
      f.db,
      {
        knowledge: (context, proposal, tx) =>
          knowledge.adopt(context, proposal, tx),
        assetTagsBatch: noExternal,
      },
      now,
    );
    const ai = createAiService({
      db: f.db,
      now,
      nextId,
      agenticProposals: adoption,
      artifacts: { createVersion: noExternal },
      knowledge: { createKnowledge: noExternal },
      candidate: { createFromAIResult: noExternal, enrichCard: noExternal },
      learnings: { createLearning: noExternal },
      publishing: { createPublicationFromDraft: noExternal },
      materialLinks: { link: noExternal },
      positioning: {
        upsertProfile: noExternal,
        createStatementVersion: noExternal,
      },
      calibration: { createDraftPrediction: noExternal },
    });
    const staging = createAgenticProposalStagingService(f.db, {
      resolveLease: () => {
        throw new Error("不能进入旧ALS执行");
      },
      prepareAssets: noExternal,
    });
    const research = createAgenticResearchTools({
      stage: (ref, input, signal) =>
        staging.stageForExecution(ref, input, signal),
    });
    const budget = { maxCalls: 24, maxTokens: 100000, deadlineMs: 60000 };
    const preparation = createAgenticBusinessExecutionService(f.db, {
      definitions: {
        "exec.agentic.research": {
          taskType: "agentic.research",
          systemPrompt:
            "操作用户授权的浏览器页面，遇到旧观察重新观察，再生成证据完整的知识候选。",
          capability: "planning",
          tools: research.definitions,
        },
      },
      budget,
      maxOutputTokens: 300,
      validateInputs: async () => {},
    });
    const sessions = createBrowserSessionsService({
      db: f.db,
      now,
      nextId,
      masterKey: createHash("sha256").update("fixture-master-key").digest(),
    });
    let mutate = false,
      mutated = false,
      clickCount = 0,
      sourceUrl = "";
    const web = createServer((req, res) => {
      if (req.url === "/state") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ mutate }));
        return;
      }
      if (req.url === "/mutated") {
        mutated = true;
        res.end("ok");
        return;
      }
      if (req.url === "/clicked") {
        clickCount++;
        res.end("ok");
        return;
      }
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.end(
        `<title>浏览器真实证据夹具</title><main><label>名字<input aria-label="名字"></label><button onclick="document.querySelector('p').textContent=document.querySelector('input').value;window.__clicked=true;fetch('/clicked')">提交</button><p>尚未提交</p></main><script>const timer=setInterval(async()=>{if((await(await fetch('/state')).json()).mutate){clearInterval(timer);document.querySelector('button').textContent='更新后提交';await fetch('/mutated');}},50);</script>`,
      );
    });
    await new Promise<void>((done) => web.listen(0, "127.0.0.1", done));
    sourceUrl = `http://browser.example.com:${(web.address() as { port: number }).port}/`;
    await writeFile(
      join(directory, "config.json"),
      JSON.stringify({ sourceUrl, mode }),
    );
    await sessions.saveState(
      ctx,
      "browser.example.com",
      JSON.stringify({
        cookies: [
          {
            name: "private_session",
            value: "browser-private-fixture",
            domain: "browser.example.com",
            path: "/",
          },
        ],
        origins: [],
      }),
    );
    const requests: string[] = [];
    let serverError: unknown;
    let oldObservation: any, current: any, extracted: any;
    const latest = (raw: string) => {
      const messages = (
        JSON.parse(raw) as {
          messages: Array<{ role: string; content: string }>;
        }
      ).messages;
      const tool = messages.filter((item) => item.role === "tool").at(-1);
      return tool ? JSON.parse(tool.content).evidence : undefined;
    };
    const server = createServer(async (req, res) => {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const raw = Buffer.concat(chunks).toString("utf8");
        requests.push(raw);
        const index = requests.length;
        let name: string | undefined, args: unknown;
        if (index === 1) {
          name = "browser.observe";
          args = { sessionId: "browser-session", url: sourceUrl };
        } else if (index === 2) {
          oldObservation = latest(raw).data.observation;
          expect(oldObservation.text).toContain("尚未提交");
          mutate = true;
          await vi.waitFor(() => expect(mutated).toBe(true), { timeout: 3000 });
          name = "browser.act";
          args = {
            sessionId: "browser-session",
            observationId: oldObservation.observationId,
            action: "click",
            targetRef: oldObservation.elements.find(
              (el: any) => el.name === "提交",
            ).targetRef,
          };
        } else if (index === 3) {
          const result = latest(raw);
          expect(result.error?.code).toBe("stale_observation");
          expect(clickCount).toBe(0);
          current = result.data.observation;
          expect(current.observationId).not.toBe(oldObservation.observationId);
          expect(current.text).toContain("更新后提交");
          name = "browser.act";
          args = {
            sessionId: "browser-session",
            observationId: current.observationId,
            action: "fill",
            targetRef: current.elements.find((el: any) => el.name === "名字")
              .targetRef,
            value: "来自真实浏览器的知识事实",
          };
        } else if (index === 4) {
          current = latest(raw).data.observation;
          name = "browser.act";
          args = {
            sessionId: "browser-session",
            observationId: current.observationId,
            action: "click",
            targetRef: current.elements.find(
              (el: any) => el.name === "更新后提交",
            ).targetRef,
          };
        } else if (index === 5) {
          current = latest(raw).data.observation;
          expect(current.text).toContain("来自真实浏览器的知识事实");
          name = "browser.act";
          args = {
            sessionId: "browser-session",
            observationId: current.observationId,
            action: "extract",
          };
        } else if (index === 6) {
          extracted = latest(raw).data;
          expect(extracted.observation.text).toContain(
            "来自真实浏览器的知识事实",
          );
          expect(extracted.evidenceRef).toMatch(/^evidence_/);
          expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
          name = "knowledge.write";
          args = {
            title: "浏览器真实知识候选",
            note: "来自真实浏览器的知识事实",
            sourceNote: sourceUrl,
            evidenceRefs: [extracted.evidenceRef],
          };
        } else if (index === 7) {
          expect(latest(raw).data.proposal.kind).toBe("knowledge.create");
          expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
        } else throw new Error("额外模型调用");
        const delta = name
          ? {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `browser-tool-${index}`,
                  type: "function",
                  function: { name, arguments: JSON.stringify(args) },
                },
              ],
            }
          : {
              role: "assistant",
              content: "已根据真实浏览器证据生成知识候选，请采纳。",
            };
        const base = {
          id: `browser-response-${index}`,
          object: "chat.completion.chunk",
          created: 1,
          model: "test",
        };
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(
          `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop" }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })}\n\ndata: [DONE]\n\n`,
        );
      } catch (error) {
        serverError = error;
        res.writeHead(500);
        res.end("fixture assertion failed");
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const errors: string[] = [];
    const dispatcher = createAgenticWorkerDispatcher(f.db, {
      entryPath,
      workerId: "browser-host",
      budget,
      pollMs: 100,
      modelConcurrency: 1,
      tools: research.tools,
      browserSessions: sessions,
      onError: (code) => errors.push(code),
      resolveModelCredential: async () => ({
        apiFormat: "openai_chat",
        authStyle: "bearer",
        baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
        model: "test",
        token: "local-model-fixture",
      }),
    });
    try {
      await f.db
        .insert(aiTasks)
        .values({
          id: "browser-task",
          userId: ctx.userId,
          accountId: ctx.accountId,
          taskType: "exec.agentic.research",
          status: "queued",
          idempotencyKey: "browser-task",
          requestedAt: now(),
          inputData: {
            spec: {
              taskType: "agentic.research",
              goal: "在授权页面填写并保存知识候选",
              inputs: [],
              params: {
                browserAuthorization: {
                  allowedDomains: ["browser.example.com"],
                  allowInteraction: true,
                },
              },
              constraints: {
                timeoutSec: 60,
                network: "deny",
                maxOutputMB: 512,
              },
            },
          },
        });
      await createBrowserTaskAuthorizationService(f.db,{now}).grant(ctx,"browser-task",{authorization:{allowedDomains:["browser.example.com"],allowInteraction:true},idempotencyKey:"browser-grant"});
      const mapped = await preparation.prepare(ctx, "browser-task");
      expect(await dispatcher.drainOnce()).toBe(1);
      if (serverError) throw serverError;
      const trace = (await readFile(join(directory, "trace.ndjson"), "utf8"))
        .trim()
        .split("\n")
        .map(
          (line) =>
            JSON.parse(line) as {
              pid: number;
              type: string;
              port?: string;
              browserPid?: number;
            },
        );
      const [execution] = await f.db
        .select()
        .from(executionTasks)
        .where(eq(executionTasks.id, mapped.executionTaskId!));
      if (mode === "unknown") {
        expect(
          execution?.status,
          JSON.stringify({ errors, execution, trace }),
        ).toBe("unknown_result");
        expect(requests).toHaveLength(4);
        await vi.waitFor(() => expect(clickCount).toBe(1));
        const calls = await f.db
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.executionTaskId, mapped.executionTaskId!));
        expect(calls).toHaveLength(8);
        expect(calls.filter((call) => call.status === "unknown")).toHaveLength(
          1,
        );
        expect(calls.filter((call) => call.status === "unknown")[0]!.kind).toBe(
          "tool",
        );
        expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
        expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);
        expect(
          trace.some((row) => row.type === "post-click-observation-failed"),
        ).toBe(true);
        expect(trace.filter((row) => row.type === "page-close")).toHaveLength(
          1,
        );
        expect(trace.filter((row) => row.type === "server-close")).toHaveLength(
          1,
        );
        expect(await dispatcher.drainOnce()).toBe(0);
        expect(requests).toHaveLength(4);
        expect(clickCount).toBe(1);
        return;
      }
      expect(
        execution?.status,
        JSON.stringify({ errors, execution, trace }),
      ).toBe("succeeded");
      expect(requests).toHaveLength(7);
      await vi.waitFor(() => expect(clickCount).toBe(1));
      expect(trace.every((row) => row.pid !== process.pid)).toBe(true);
      expect(
        trace.filter((row) => row.port === "prepareBrowserAction"),
      ).toHaveLength(5);
      expect(trace.some((row) => row.port === "settleBrowserObservation")).toBe(
        true,
      );
      expect(trace.filter((row) => row.type === "page")).toHaveLength(1);
      expect(trace.filter((row) => row.type === "page-close")).toHaveLength(1);
      expect(trace.filter((row) => row.type === "context-close")).toHaveLength(
        1,
      );
      expect(trace.filter((row) => row.type === "server-close")).toHaveLength(
        1,
      );
      const browserPid = trace.find(
        (row) => row.type === "server",
      )!.browserPid!;
      await vi.waitFor(() => {
        let running = false;
        try {
          running = !/Z/.test(
            execFileSync("ps", ["-p", String(browserPid), "-o", "stat="], {
              encoding: "utf8",
              stdio: ["ignore", "pipe", "ignore"],
            }),
          );
        } catch {}
        expect(running).toBe(false);
      });
      const providerText = requests.join("\n");
      for (const secret of [
        "browser-private-fixture",
        "stateJson",
        "cookies",
        "revision",
        "loginStates",
      ])
        expect(providerText).not.toContain(secret);
      const snapshots = await f.db
        .select()
        .from(executionEvidence)
        .where(eq(executionEvidence.executionTaskId, mapped.executionTaskId!));
      expect(
        snapshots.find((row) => row.id === extracted.evidenceRef)?.fullText,
      ).toContain("来自真实浏览器的知识事实");
      expect(await f.db.select().from(knowledgeItems)).toHaveLength(0);
      expect((await ai.getTask(ctx, "browser-task")).status).toBe(
        "awaiting_confirmation",
      );
      const calls = await f.db
        .select()
        .from(executionCalls)
        .where(eq(executionCalls.executionTaskId, mapped.executionTaskId!));
      expect(calls).toHaveLength(13);
      expect(calls.every((call) => call.status === "settled")).toBe(true);
      expect((await ai.confirmTask(ctx, "browser-task")).status).toBe(
        "succeeded",
      );
      expect((await ai.confirmTask(ctx, "browser-task")).status).toBe(
        "succeeded",
      );
      const reader = createKnowledgeService(
        createKnowledgeRepository(f.db, { now, nextId }),
      );
      const rows = await reader.listKnowledge(ctx);
      expect(rows).toHaveLength(1);
      expect((await reader.getKnowledge(ctx, rows[0]!.id)).sourceNote).toBe(
        sourceUrl,
      );
      expect(await f.db.select().from(knowledgeRevisions)).toHaveLength(1);
      expect(await f.db.select().from(knowledgeAdoptions)).toHaveLength(1);
    } finally {
      await writeFile(
        resolve(
          `../docs/research/evidence/t915/browser-pi-full-${mode}-trace-${Date.now()}.ndjson`,
        ),
        await readFile(join(directory, "trace.ndjson"), "utf8").catch(
          () => "no trace",
        ),
      );
      await dispatcher.stop();
      server.closeAllConnections();
      web.closeAllConnections();
      await Promise.all([
        new Promise<void>((done) => server.close(() => done())),
        new Promise<void>((done) => web.close(() => done())),
      ]);
      await f.client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  60000,
);
