import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent,waitFor,act } from "@testing-library/react";
import { CreationFlowCtas } from "./creation-flow-ctas";

// T-730:论点入口恢复为可选辅助，不替代上传与联网找资料。
const openChat = vi.fn();
const prepareScriptForCreation=vi.fn(),preparePair=vi.fn();
vi.mock("./draft-chat-request", () => ({
  useDraftChatRequest: () => ({ openChat,prepareScriptForCreation }),
}));
vi.mock('./work-creation-request',()=>({prepareWorkCreationRequest:(...args:unknown[])=>preparePair(...args)}));

// [T-146] CreationFlowCtas 现用 useRouter()(上传成功后 refresh 让弹药卡出现)。
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

describe("CreationFlowCtas(T-127 创作流引导 CTA)", () => {
  beforeEach(() => {openChat.mockClear();prepareScriptForCreation.mockReset();preparePair.mockReset();sessionStorage.clear();});

  it("[T-730] 保留上传与联网找资料，并恢复可选的先梳理观点", () => {
    render(<CreationFlowCtas projectId="project-x" />);
    expect(
      screen.getByRole("button", { name: /上传.*素材/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /联网找资料/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /先梳理观点.*可选/ }),
    ).toBeInTheDocument();
  });

  it("[T-733] 新方向只恢复一个可选按钮，不恢复旧的强制链接", () => {
    render(<CreationFlowCtas projectId="project-x" />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.queryByRole("link", { name: /立论点/ })).not.toBeInTheDocument();
  });
  it("[T-146] 脚本联合主动作在最前，上传作为次操作", () => {
    const { container } = render(<CreationFlowCtas projectId="project-x" />);
    const buttons = container.querySelectorAll("button");
    expect(buttons[0]?.textContent ?? "").toMatch(/一键生成文章和图文/);
    expect(buttons[1]?.textContent ?? "").toMatch(/上传.*素材/);
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
    fireEvent.click(screen.getByRole("button", { name: /联网找资料/ }));
    expect(openChat).toHaveBeenCalledTimes(1);
    expect(openChat.mock.calls[0][0]).toMatchObject({
      functionKey: "material.gather",
      autoSend: true,
    });
  });

  it("[T-730] 点可选梳理入口 → planning.thesis，不自动写稿", () => {
    render(<CreationFlowCtas projectId="project-x" />);
    fireEvent.click(screen.getByRole("button", { name: /先梳理观点.*可选/ }));
    expect(openChat).toHaveBeenCalledWith(
      expect.objectContaining({
        functionKey: "planning.thesis",
        autoSend: true,
      }),
    );
  });

  it('严格脚本保存失败时不创建组合或发送付费任务',async()=>{
    prepareScriptForCreation.mockRejectedValue(Error('原脚本保存未知'));
    render(<CreationFlowCtas projectId="project-x"/>);fireEvent.click(screen.getByRole('button',{name:'一键生成文章和图文'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('原脚本保存未知');expect(preparePair).not.toHaveBeenCalled();expect(openChat).not.toHaveBeenCalled();
  });
  it('联合生成只发一次，刷新后的原请求仍用冻结 target 读回，真实完成后允许下一次',async()=>{
    const source={kind:'project_script',id:'script',versionId:'script-v'},target={clientRequestId:'original',scriptSourceRef:source};
    prepareScriptForCreation.mockResolvedValue(source);preparePair.mockResolvedValue(target);
    const view=render(<CreationFlowCtas projectId="project-x"/>);fireEvent.click(screen.getByRole('button',{name:'一键生成文章和图文'}));
    await waitFor(()=>expect(openChat).toHaveBeenCalledOnce());expect(openChat.mock.calls[0][0]).toMatchObject({autoSend:true,creationTarget:target});
    view.unmount();render(<CreationFlowCtas projectId="project-x"/>);fireEvent.click(screen.getByRole('button',{name:'查看原文章和图文生成'}));
    const restored=openChat.mock.calls[1][0];expect(restored).toMatchObject({autoSend:false,creationTarget:target});expect(preparePair).toHaveBeenCalledOnce();expect(prepareScriptForCreation).toHaveBeenCalledOnce();
    act(()=>restored.onCreationSettled());expect(screen.getByRole('button',{name:'一键生成文章和图文'})).toBeEnabled();
  });

});
