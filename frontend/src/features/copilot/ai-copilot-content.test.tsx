/**
 * Contract tests for the AI Copilot dialog (Task 24 / page-specs §16).
 *
 * Spec invariants under test:
 *  - The dialog is rendered inside exactly ONE shared AppShell.
 *  - The OverlayController is mounted once and centers the panel
 *    (NOT a right-side drawer — page-specs §16 "弹窗居中").
 *  - The component tree matches page-specs §16:
 *      PromptComposer
 *        ├── PromptInput (textarea)
 *        ├── SuggestedActionChips (4 chips)
 *        └── SubmitButton
 *      CopilotDashboard
 *        ├── RecommendedCommands (4 cards)
 *        ├── RecentTasks (real feed; loading/empty state, no fixture rows)
 *        └── ContinuingTasks (real in-progress feed; loading/empty state, no fixture rows)
 *      QuickEntries (3 entries)
 *      SmartRecommendation (2 items)
 *  - The dialog closes when `data-overlay-close` is clicked (close button).
 *  - The submit button does NOT post a real network request — its parent
 *    form has no `action` and no `onSubmit` handler.
 *  - No message-thread UI is rendered.
 *  - The dialog is `role="dialog"` with `aria-modal="true"`.
 */

import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCopilotViewModel } from "@/fixtures/selectors/copilot";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("copilot=open"),
}));

// T1188只注入原SDK消息协议，新增任务hook/contract/HTTP均真实执行。
const chatInput = vi.hoisted(() => ({
  messages: [] as Array<{id:string;role:"assistant";parts:Array<{type:"tool-project_transcribe";toolCallId:string;state:"output-available";input:Record<string,unknown>;output:Record<string,unknown>}>}>,
  setMessages: vi.fn(), sendMessage: vi.fn(), stop: vi.fn(), regenerate: vi.fn(), addToolApprovalResponse: vi.fn(),
}));
vi.mock("@ai-sdk/react", async importOriginal => {
  const actual = await importOriginal<typeof import("@ai-sdk/react")>();
  return { ...actual, useChat: () => ({ ...chatInput, status:"ready",error:undefined }) };
});

import { AICopilotContent } from "./ai-copilot-content";
import { ENDPOINTS } from "@creatoros/contract";
import { AppShell } from "@/components/shell/app-shell";
import { OverlayController } from "@/components/overlays/overlay-controller";
import { AICopilotDialog } from "@/components/overlays/ai-copilot-dialog";

afterEach(() => { cleanup(); chatInput.messages = []; vi.unstubAllGlobals(); });

function renderDialog() {
  return render(
    <AppShell pathname="/">
      <main data-page="test">
        <p>underlay</p>
      </main>
      <OverlayController>
        <AICopilotDialog pathname="/" />
      </OverlayController>
    </AppShell>,
  );
}

function slot(dialog: HTMLElement, name: string) {
  return dialog.querySelector(`[data-slot="${name}"]`);
}

describe("AI Copilot dialog (Task 24)", () => {
  it("renders the dialog inside the single shared AppShell with one sidebar and one top-header", () => {
    renderDialog();
    expect(screen.getAllByTestId("app-shell")).toHaveLength(1);
    expect(screen.getAllByTestId("app-sidebar")).toHaveLength(1);
    expect(screen.getAllByTestId("app-top-header")).toHaveLength(1);
  });

  it("renders the dialog with role=dialog and aria-modal=true and is centered (not a right-side drawer)", () => {
    renderDialog();
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("aria-modal", "true");
    const layer = panel.closest('[data-slot="overlay-layer"]');
    expect(layer).not.toBeNull();
    expect(layer!.className).toContain("items-center");
    expect(layer!.className).toContain("justify-center");
    expect(layer!.className).not.toContain("justify-end");
  });

  it("renders the page-specs §16 component tree in order", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    // PromptComposer
    expect(slot(dialog, "prompt-composer")).not.toBeNull();
    expect(slot(dialog, "prompt-input")).not.toBeNull();
    expect(slot(dialog, "suggested-action-chips")).not.toBeNull();
    expect(slot(dialog, "submit-button")).not.toBeNull();

    // [T-354] 次区(CopilotDashboard 三卡:推荐指令/最近任务/继续任务 + 快捷入口/智能推荐)
    // 已整体下架(用户真机反馈冗余)—— 对话 + 快捷 chip 已覆盖;任务进度走对话区顶部通知卡。
    expect(slot(dialog, "copilot-dashboard")).toBeNull();
    expect(slot(dialog, "recommended-commands")).toBeNull();
    expect(slot(dialog, "recent-tasks")).toBeNull();
    expect(slot(dialog, "continuing-tasks")).toBeNull();
    expect(slot(dialog, "quick-entries")).toBeNull();
    expect(slot(dialog, "smart-recommendation")).toBeNull();
  });

  it("exposes the prompt region only ([T-354] secondary regions removed)", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");

    expect(
      Array.from(dialog.querySelectorAll('[data-slot-region="copilot-region"]')).map(
        (node) => node.getAttribute("data-region"),
      ),
    ).toEqual(["prompt"]);
  });

  it("renders the reference fixture counts", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    // [T-836] 原 5 个真入口旁增加按当前稿语义生成图片/视频素材两个入口。
    // [T-354] 次区计数断言随次区下架删除(recommended-command/recent-task/continuing-task/
    // quick-entry/smart-recommendation 均不再渲染)。
    expect(dialog.querySelectorAll('[data-slot="suggested-chip"]')).toHaveLength(7);
    expect(dialog.querySelectorAll('[data-slot="recommended-command"]')).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-slot="recent-task"]')).toHaveLength(0);
    expect(dialog.querySelectorAll('[data-slot="continuing-task"]')).toHaveLength(0);
    expect(slot(dialog, "recent-tasks-loading")).toBeNull();
    expect(slot(dialog, "continuing-tasks-loading")).toBeNull();
    expect(dialog.querySelectorAll('[data-slot="quick-entry"]')).toHaveLength(0);
    expect(
      dialog.querySelectorAll('[data-slot="smart-recommendation-item"]'),
    ).toHaveLength(0);
  });

  it("生成封面入口绑定专用封面工具，并要求自动选择最新且最关联的已发布作品", () => {
    const viewModel = buildCopilotViewModel();
    const cover = viewModel.chips.find((chip) => chip.id === "cover");

    expect(cover?.functionKey).toBe("cover.generate");
    expect(cover?.prefill).toContain("最新且最关联");
    expect(cover?.prefill).toContain("直接生成");
  });

  it("图片按稿件需要生成多段候选，视频默认只生成一个候选", () => {
    const viewModel = buildCopilotViewModel();
    const image = viewModel.chips.find((chip) => chip.id === "generate-image-material");
    const video = viewModel.chips.find((chip) => chip.id === "generate-video-material");

    expect(image).toMatchObject({
      label: "生成图片素材",
      functionKey: "material.generate.image",
    });
    expect(video).toMatchObject({
      label: "生成视频素材",
      functionKey: "material.generate.video",
    });
    expect(image?.prefill).toContain("先读取当前确认稿");
    expect(video?.prefill).toContain("先读取当前确认稿");
    expect(image?.prefill).toContain("根据稿件篇幅");
    expect(image?.prefill).toContain("选择多个");
    expect(image?.prefill).toContain("每个段落各生成一张");
    expect(image?.prefill).not.toContain("唯一服务段落");
    expect(video?.prefill).toContain("默认只生成一个");
    expect(video?.prefill).toContain("控制生成成本");
    expect(video?.prefill).toContain("除非我明确要求");
    expect(image?.prefill).not.toContain("context.artifact.text");
    expect(video?.prefill).not.toContain("material.generate");
    expect(video?.prefill).toContain("连续短镜头");
  });

  it("renders the close button with data-overlay-close so the controller's delegated click handler closes the dialog", () => {
    renderDialog();
    const closeButton = document.querySelector('[data-slot="ai-copilot-close"]');
    expect(closeButton).not.toBeNull();
    expect(closeButton).toHaveAttribute("data-overlay-close");
    expect(closeButton).toHaveAttribute("aria-label", "关闭 AI 助手");
  });

  it("does NOT render a message thread UI", () => {
    renderDialog();
    expect(document.querySelector('[data-slot="message-thread"]')).toBeNull();
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("does NOT post a real network request: the submit button is type=submit and is inside a form with no action", () => {
    renderDialog();
    const submit = document.querySelector('[data-slot="submit-button"]') as HTMLElement;
    expect(submit).not.toBeNull();
    expect(submit).toHaveAttribute("type", "submit");
    const form = submit.closest("form");
    expect(form).not.toBeNull();
    expect(form!.getAttribute("action")).toBeNull();
    // The textarea has no fetch consumer.
    const textarea = document.querySelector(
      '[data-slot="prompt-input"]',
    ) as HTMLElement;
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });
});


describe("T1188 实际 Copilot 原 project.transcribe 工具回执入口", () => {
  function receipts(output: Record<string,unknown>) {
    chatInput.messages=[{id:"assistant-receipt",role:"assistant",parts:[{type:"tool-project_transcribe",toolCallId:"call-original",state:"output-available",input:{},output}]}];
    localStorage.setItem("creatoros:current-group", "group-1");
    const requests: Array<{id:string;input:{params?:{taskId?:string}}}> = [];
    const TIME="2026-10-09T00:00:00.000Z";
    vi.stubGlobal("fetch", vi.fn(async (_url:RequestInfo|URL, init?:RequestInit) => {
      const request=JSON.parse(String(init?.body)) as (typeof requests)[number]; requests.push(request);
      const envelope=(data:unknown,list=false)=>Response.json({data,meta:{requestId:"t1188",...(list?{page:1,pageSize:100,total:Array.isArray(data)?data.length:0}:{})}});
      if(request.id==="settings.get")return envelope({id:"user-1",email:"synthetic@example.invalid",displayName:"测试创作者",timezone:"Asia/Shanghai",locale:"zh-CN",createdAt:TIME,updatedAt:TIME});
      if(request.id==="accountGroups.get")return envelope({id:"group-1",userId:"user-1",name:"本人组",status:"active",version:1,createdAt:TIME,updatedAt:TIME,members:[]});
      if(request.id==="ai.tasks.get")return envelope(ENDPOINTS.getTask.response.parse({id:"task-original",userId:"user-1",groupId:"group-1",projectId:null,contentOutputId:null,taskType:"transcribe.douyin",status:"succeeded",inputData:{awemeIds:["aweme-1"]},modelKey:"local",idempotencyKey:"paid-original",attemptId:"11111111-1111-4111-8111-111111111111",requestFingerprint:`sha256:${"a".repeat(64)}`,retryOfTaskId:null,requestedAt:TIME,startedAt:TIME,completedAt:TIME,errorMessage:null}));
      if(request.id==="ai.tasks.steps.list")return envelope([{stepNo:1,kind:"step",text:"原真实确认保存步骤",toolCalls:[],createdAt:TIME}],true);
      return envelope([],true);
    }));
    render(<AICopilotContent viewModel={buildCopilotViewModel()}/>);
    return requests;
  }
  it("真实 tool output taskId 接准确原 task 与 steps，零重发", async () => {
    const requests=receipts({kind:"project.transcribe",taskId:"task-original"});
    expect(document.querySelector('[data-slot="copilot-transcribe-status"]')).toHaveAttribute("data-ok","true");
    fireEvent.click(await screen.findByRole("button",{name:"查看转写进度"}));
    await screen.findByText("第 1 步：原真实确认保存步骤");
    expect(requests.filter(row=>row.id==="ai.tasks.get").every(row=>row.input.params?.taskId==="task-original")).toBe(true);
    expect(requests.some(row=>row.id==="projects.transcribe"||row.id==="execution.tasks.command")).toBe(false);
    expect(document.querySelector('[data-slot="copilot-dashboard"]')).toBeNull();
  });
  it("缺taskId保持未确认且无任务hook/POST", async () => {
    const requests=receipts({kind:"project.transcribe"});
    await waitFor(()=>expect(document.querySelector('[data-slot="copilot-transcribe-status"]')).toHaveAttribute("data-ok","unknown"));
    expect(screen.queryByRole("button",{name:"查看转写进度"})).toBeNull();
    expect(screen.getByText(/未取得准确任务编号/)).toBeVisible();
    expect(requests.some(row=>row.id==="ai.tasks.get"||row.id==="projects.transcribe")).toBe(false);
  });
  it("工具error即使带taskId不装成功进度或重发", () => {
    const requests=receipts({kind:"project.transcribe",taskId:"task-original",error:"原作品来源未确认"});
    expect(document.querySelector('[data-slot="copilot-transcribe-status"]')).toHaveAttribute("data-ok","false");
    expect(screen.getByText("✗ 原作品来源未确认")).toBeVisible();
    expect(screen.queryByRole("button",{name:"查看转写进度"})).toBeNull();
    expect(requests.some(row=>row.id==="ai.tasks.get"||row.id==="projects.transcribe")).toBe(false);
  });
});
