/**
 * 行为测试:TipTap 脚本富文本编辑器(T-019 / L4)。
 *
 * 覆盖:
 *  - 编辑器在 jsdom 下真挂载(ProseMirror contenteditable 出现),初值 HTML 灌入;
 *  - 工具栏 role="toolbar" + 每个格式按钮带 aria-pressed(真富文本控件,非装饰);
 *  - 保存(有 artifactId)→ client.createArtifactVersion 带 contentData.html + sections + contentText
 *    → router.refresh();fixture-only(无 artifactId)保存不打契约。
 *
 * TipTap/ProseMirror 在 jsdom 下用 `immediatelyRender:false`,故渲染异步 —— 用 waitFor 等。
 */

import * as React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";

import { ScriptRichEditor } from "./script-rich-editor";

const mockRouter = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({ useRouter: () => mockRouter }));

const mockCreateArtifactVersion = vi.fn(
  (input: unknown): Promise<unknown> => Promise.resolve({ id: "av-new", input }),
);
vi.mock("@/lib/contract-client", () => ({
  client: {
    createArtifactVersion: (input: unknown) =>
      mockCreateArtifactVersion(input),
  },
}));

afterEach(() => cleanup());
beforeEach(() => {
  mockRouter.refresh.mockClear();
  mockCreateArtifactVersion.mockClear();
});

const INITIAL_HTML =
  "<h2>开场 15 秒</h2><p>你有没有想过浏览器也能帮你完成任务？</p><h2>金句</h2><p><strong>AI Native Browser 不是工具，而是同事。</strong></p>";

async function findProseMirror(): Promise<HTMLElement> {
  return await waitFor(() => {
    const el = document.querySelector(
      '[data-slot="script-prosemirror"]',
    ) as HTMLElement | null;
    expect(el).not.toBeNull();
    return el!;
  });
}

describe("ScriptRichEditor (TipTap)", () => {
  it("mounts a ProseMirror contenteditable seeded with the initial HTML", async () => {
    render(<ScriptRichEditor initialHtml={INITIAL_HTML} />);
    const pm = await findProseMirror();
    expect(pm.getAttribute("contenteditable")).toBe("true");
    // The seeded heading + body text shows up in the editable document.
    await waitFor(() => {
      expect(pm.textContent ?? "").toContain("开场 15 秒");
      expect(pm.textContent ?? "").toContain("浏览器也能帮你完成任务");
    });
  });

  it("renders a role=toolbar with format buttons carrying aria-pressed", async () => {
    render(<ScriptRichEditor initialHtml={INITIAL_HTML} />);
    await findProseMirror();
    const toolbar = document.querySelector(
      '[data-slot="editor-toolbar"]',
    ) as HTMLElement;
    expect(toolbar).not.toBeNull();
    expect(toolbar.getAttribute("role")).toBe("toolbar");
    const buttons = toolbar.querySelectorAll(
      '[data-slot="editor-toolbar-button"]',
    );
    expect(buttons.length).toBeGreaterThanOrEqual(3);
    buttons.forEach((b) => expect(b.hasAttribute("aria-pressed")).toBe(true));
    // The bold button exists (data-format="bold").
    expect(
      toolbar.querySelector(
        '[data-slot="editor-toolbar-button"][data-format="bold"]',
      ),
    ).not.toBeNull();
  });

  it("exposes the editor shell, document slot and status bar (word count + save status)", async () => {
    render(<ScriptRichEditor initialHtml={INITIAL_HTML} />);
    await findProseMirror();
    const shell = document.querySelector('[data-slot="rich-text-editor"]');
    expect(shell).not.toBeNull();
    expect(
      shell!.querySelector('[data-slot="script-document"]'),
    ).not.toBeNull();
    const statusBar = shell!.querySelector('[data-slot="editor-status-bar"]');
    expect(statusBar).not.toBeNull();
    expect(
      statusBar!.querySelector('[data-slot="editor-status-word-count"]'),
    ).not.toBeNull();
    expect(
      statusBar!.querySelector('[data-slot="editor-status-save-status"]'),
    ).not.toBeNull();
  });

  it("toggling bold via a real TipTap command flips the toolbar aria-pressed", async () => {
    // jsdom has no layout → ProseMirror can't resolve a caret from a mouse coord.
    // Drive editing through the editor handle (TipTap's recommended test path).
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>脚本正文</p>"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    const bold = document.querySelector(
      '[data-slot="editor-toolbar-button"][data-format="bold"]',
    ) as HTMLButtonElement;
    expect(bold.getAttribute("aria-pressed")).toBe("false");
    // Select the whole doc, then toggle bold — the toolbar must reflect the active mark.
    editor!.chain().selectAll().toggleBold().run();
    await waitFor(() =>
      expect(bold.getAttribute("aria-pressed")).toBe("true"),
    );
  });

  it("editing flips save status to dirty", async () => {
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>开场</p>"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    expect(status.getAttribute("data-save-status")).toBe("saved");
    editor!.chain().focus("end").insertContent("补充内容").run();
    await waitFor(() =>
      expect(status.getAttribute("data-save-status")).toBe("dirty"),
    );
  });

  it("real Save (with artifactId) persists html + sections + contentText and refreshes", async () => {
    const user = userEvent.setup();
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml={INITIAL_HTML}
        artifactId="artifact-1"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    editor!.chain().focus("end").insertContent("。").run();
    await waitFor(() => {
      const status = document.querySelector(
        '[data-slot="editor-status-save-status"]',
      ) as HTMLElement;
      expect(status.getAttribute("data-save-status")).toBe("dirty");
    });
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() =>
      expect(mockCreateArtifactVersion).toHaveBeenCalledTimes(1),
    );
    const call = mockCreateArtifactVersion.mock.calls[0]![0] as {
      params: { artifactId: string };
      body: {
        contentText: string;
        contentData: {
          html: string;
          sections: Array<{ heading: string; body: string }>;
        };
        changeSummary: string;
      };
    };
    expect(call.params).toEqual({ artifactId: "artifact-1" });
    expect(call.body.changeSummary).toBe("编辑脚本");
    // contentData.html carries the rich-text body (faithful round-trip source).
    expect(call.body.contentData.html).toContain("<h2>开场 15 秒</h2>");
    expect(call.body.contentData.html).toContain("<strong>");
    // contentData.sections is the derived structure (outline/golden-quote + AI compat).
    expect(call.body.contentData.sections.length).toBeGreaterThanOrEqual(2);
    expect(call.body.contentData.sections[0]!.heading).toBe("开场 15 秒");
    // contentText is the plain-text projection.
    expect(call.body.contentText).toContain("开场 15 秒");

    await waitFor(() => expect(mockRouter.refresh).toHaveBeenCalled());
    const status = document.querySelector(
      '[data-slot="editor-status-save-status"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(status.getAttribute("data-save-status")).toBe("saved"),
    );
  });

  it("local-only Save (no artifactId) does NOT call the contract client", async () => {
    const user = userEvent.setup();
    let editor: Editor | null = null;
    render(
      <ScriptRichEditor
        initialHtml="<p>开场</p>"
        onEditorReady={(e) => (editor = e)}
      />,
    );
    await findProseMirror();
    await waitFor(() => expect(editor).not.toBeNull());
    editor!.chain().focus("end").insertContent("改一下").run();
    await user.click(screen.getByRole("button", { name: "保存" }));
    expect(mockCreateArtifactVersion).not.toHaveBeenCalled();
  });
});
