import { describe, expect, it } from "vitest";
import { projectWorkspaces } from "./project-workspaces";

describe("T-1051 真实作品工作台导航", () => {
  it("文章项目不展示视频和图文", () => {
    expect(projectWorkspaces("project-a", "/projects/project-a/article", [{id: "article-a", contentType: "article"}]).map(item => item.id)).toEqual(["script", "article", "review"]);
  });
  it("多选的真实作品同时出现，视频含脚本和剪辑", () => {
    const tabs = projectWorkspaces("project-a", "/projects/project-a/outputs/image-a/image", [
      {id: "article-a", contentType: "article"}, {id: "image-a", contentType: "image"}, {id: "video-a", contentType: "video"},
    ]);
    expect(tabs.map(item => item.id)).toEqual(["script", "article", "image", "production", "review"]);
    expect(tabs.find(item => item.id === "image")?.href).toBe("/projects/project-a/outputs/image-a/image");
    expect(tabs.find(item => item.id === "script")?.href).toBe("/projects/project-a");
    expect(tabs.find(item => item.id === "image")?.status).toBe("in_progress");
  });
  it("重复类型只展示一个 Tab，优先保持当前作品", () => {
    const tabs = projectWorkspaces("p", "/projects/p/outputs/image-b/image", [{id: "image-a", contentType: "image"}, {id: "image-b", contentType: "image"}]);
    expect(tabs.filter(item => item.id === "image")).toHaveLength(1);
    expect(tabs.find(item => item.id === "image")?.href).toContain("image-b/image");
  });
  it("空 output 旧项目保留既有视频入口", () => {
    expect(projectWorkspaces("p", "/projects/p", []).map(item => item.id)).toEqual(["script", "production", "review"]);
  });
  it("读取失败只显示公共入口和当前工作台", () => {
    expect(projectWorkspaces("p", "/projects/p/article", null).map(item => item.id)).toEqual(["script", "article", "review"]);
  });
});

it("图文单选仍有主脚本但不建立视频制作", () => {
  expect(projectWorkspaces("p", "/projects/p", [{id:"g",contentType:"image"}]).map(t=>t.id)).toEqual(["script","image","review"]);
});
