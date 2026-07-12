import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreationFlowCtas } from "./creation-flow-ctas";

// T-127:稿面创作流引导 CTA。锁「搜素材/立论点」两钮 → openChat 用对的 functionKey(半自动一键触发)。
// T-146:新增「＋上传素材」钮(上传进当前项目弹药库)。
const openChat = vi.fn();
vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat }),
}));

// [T-146] CreationFlowCtas 现用 useRouter()(上传成功后 refresh 让弹药卡出现)。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("CreationFlowCtas(T-127 创作流引导 CTA)", () => {
  beforeEach(() => openChat.mockClear());

  it("[T-146] 渲三钮:＋上传素材 + 搜素材(联网)+ 立论点", () => {
    render(<CreationFlowCtas projectId="project-x" />);
    expect(
      screen.getByRole("button", { name: /上传素材/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /搜素材/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /立论点/ })).toBeInTheDocument();
  });

  it("[T-146] 上传按钮在最前面(第一个 CTA 按钮)", () => {
    const { container } = render(<CreationFlowCtas projectId="project-x" />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]?.textContent ?? "").toMatch(/上传素材/);
  });

  it("[T-146] 有隐藏 file input,accept 覆盖文档类型(pdf/doc/docx/md/txt)", () => {
    const { container } = render(<CreationFlowCtas projectId="project-x" />);
    const input = container.querySelector(
      '[data-slot="creation-flow-upload-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.getAttribute("accept")).toContain(".pdf");
    expect(input!.getAttribute("accept")).toContain(".docx");
    expect(input!.getAttribute("accept")).toContain(".md");
  });

  it("[T-265] 点「搜素材」→ openChat functionKey=material.gather + autoSend(死链修:原 research.gather_material 不在 ALL_CHAT_TOOL_NAMES → 空点)", () => {
    render(<CreationFlowCtas projectId="project-x" />);
    fireEvent.click(screen.getByRole("button", { name: /搜素材/ }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "material.gather",
      autoSend: true,
    });
  });

  it("点「立论点」→ openChat functionKey=planning.thesis + autoSend", () => {
    render(<CreationFlowCtas projectId="project-x" />);
    fireEvent.click(screen.getByRole("button", { name: /立论点/ }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "planning.thesis",
      autoSend: true,
    });
  });
});
