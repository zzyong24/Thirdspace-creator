import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resolveRoute } from "@/app/(creator)/shell-router";
import { ProjectStageStepper } from "@/components/navigation/project-stage-stepper";
import { WORK_CHOICES } from "./project-output-home";

afterEach(cleanup);
describe("T1043 同项目工作面", () => {
  it("创作形式只分文章、图文、视频", () => {
    expect(WORK_CHOICES.map(choice => choice.label)).toEqual(["文章", "图文", "视频"]);
    expect(new Set(WORK_CHOICES.map(choice => choice.contentType)).size).toBe(3);
  });
  it.each([
    "/projects/project-real", "/projects/project-real/image", "/projects/project-real/article",
    "/projects/project-real/production", "/projects/project-real/review",
    "/projects/project-real/outputs/output-real/image", "/projects/project-real/outputs/output-real/video",
  ])("%s 保留完整项目顶栏且真实多形式工作台可直接进入", path => {
    const route = resolveRoute(path, {routeParam: "project-real", projectId: "project-real", title: "真实项目", stage: "brief", progressPct: 0, workOutputs: [{id: "article-real", contentType: "article"}, {id: "output-real", contentType: "image"}, {id: "video-real", contentType: "video"}]});
    expect(route.headerMode).toBe("project-workspace");
    expect(route.projectStages?.map(stage => stage.label)).toEqual(["脚本", "文章", "图文", "制作视频", "复盘"]);
    render(<ProjectStageStepper projectId="project-real" variant="segmented" stages={route.projectStages!} currentStage="script" />);
    expect(screen.getByRole("link", {name:"图文"})).toHaveAttribute("href", "/projects/project-real/outputs/output-real/image");
    expect(screen.getByRole("link", {name:"文章"})).toHaveAttribute("href", "/projects/project-real/article?outputId=article-real");
    expect(screen.getByRole("link", {name:"复盘"})).toHaveAttribute("href", "/projects/project-real/review");
    expect(screen.getByRole("link", {name:"脚本"})).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", {name:"脚本"})).toHaveAttribute("href", "/projects/project-real");
  });
});
