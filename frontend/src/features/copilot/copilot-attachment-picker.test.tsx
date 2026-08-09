import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CopilotAttachmentPicker } from "./copilot-attachment-picker";

const uploadFileForCopilot = vi.fn<
  (
    file: File,
    projectId?: string | null,
  ) => Promise<{ assetId: string; deduplicated?: boolean }>
>();

vi.mock("@/features/draft-workbench/upload-to-project", () => ({
  uploadFileForCopilot: (file: File, projectId?: string | null) =>
    uploadFileForCopilot(file, projectId),
}));

afterEach(cleanup);
beforeEach(() => {
  uploadFileForCopilot.mockReset();
  uploadFileForCopilot.mockResolvedValue({ assetId: "asset-secure-1" });
});

describe("[T-716] CopilotAttachmentPicker", () => {
  it("拖入支持的文档后复用素材上传链，并只向外暴露素材 ID", async () => {
    const onStateChange = vi.fn();
    const { container } = render(
      <CopilotAttachmentPicker projectId="project-1" onStateChange={onStateChange} />,
    );
    const file = new File(["用户文档正文"], "需求说明.md", {
      type: "text/markdown",
      lastModified: 1,
    });
    fireEvent.drop(container.querySelector('[data-slot="copilot-attachment-picker"]')!, {
      dataTransfer: { files: [file] },
    });

    expect(screen.getByText("需求说明.md")).toBeInTheDocument();
    expect(screen.getByText("上传中")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("已就绪")).toBeInTheDocument());
    expect(uploadFileForCopilot).toHaveBeenCalledWith(file, "project-1");
    expect(onStateChange).toHaveBeenLastCalledWith({
      ids: ["asset-secure-1"],
      uploading: false,
      count: 1,
    });
  });

  it("不支持的文件在调用上传接口前就给出明确原因", () => {
    const { container } = render(
      <CopilotAttachmentPicker onStateChange={() => undefined} />,
    );
    const file = new File(["binary"], "archive.zip", {
      type: "application/zip",
      lastModified: 2,
    });
    fireEvent.drop(container.querySelector('[data-slot="copilot-attachment-picker"]')!, {
      dataTransfer: { files: [file] },
    });
    expect(screen.getByText(/仅支持图片、PDF、DOCX/)).toBeInTheDocument();
    expect(uploadFileForCopilot).not.toHaveBeenCalled();
  });

  it("服务端按内容去重后，附件栏只保留一个素材上下文", async () => {
    uploadFileForCopilot.mockResolvedValue({
      assetId: "asset-existing",
      deduplicated: true,
    });
    const onStateChange = vi.fn();
    const { container } = render(
      <CopilotAttachmentPicker onStateChange={onStateChange} />,
    );
    const first = new File(["same bytes"], "原名.pdf", {
      type: "application/pdf",
      lastModified: 1,
    });
    const renamed = new File(["same bytes"], "改名.pdf", {
      type: "application/pdf",
      lastModified: 2,
    });
    const dropZone = container.querySelector(
      '[data-slot="copilot-attachment-picker"]',
    )!;
    fireEvent.drop(dropZone, { dataTransfer: { files: [first] } });
    await waitFor(() => expect(screen.getByText("已就绪")).toBeInTheDocument());
    fireEvent.drop(dropZone, { dataTransfer: { files: [renamed] } });
    await waitFor(() =>
      expect(screen.getByText("相同内容已存在，已直接复用原素材。")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("已就绪")).toHaveLength(1);
    expect(onStateChange).toHaveBeenLastCalledWith({
      ids: ["asset-existing"],
      uploading: false,
      count: 1,
    });
  });
});
