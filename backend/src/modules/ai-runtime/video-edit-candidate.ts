import {videoRenderProps} from "@creatoros/contract";
import type {ProjectsService} from "../projects";
import type {ProductionService} from "../production";
import type {MaterialLinksService} from "../material-links";
import type {AssetsService} from "../assets";
import type {ChatVideoEditPorts} from "./chat-video-edit-tool-host";

/** 只读当前领域事实并落实用户明确的编辑参数；采纳和渲染仍由既有领域服务负责。 */
export function createVideoEditCandidatePreparer(ports:{
 projectsService:Pick<ProjectsService,"listOutputRefsByProjects">;
 productionService:Pick<ProductionService,"readProduction">;
 materialLinksService:Pick<MaterialLinksService,"list">;
 assetsService:Pick<AssetsService,"getAsset">;
}):ChatVideoEditPorts["prepareVideoEdit"]{
 const {projectsService,productionService,materialLinksService,assetsService}=ports;
 return async(ctx,input)=>{
    const outputs=(await projectsService.listOutputRefsByProjects(ctx,[input.projectId])).filter(row=>row.projectId===input.projectId && row.contentType==="video");
    if(outputs.length!==1)throw new Error(outputs.length?"请进入要修改的具体视频作品，在制作工作台选中片段后调整。":"当前项目还没有可调整的视频作品。");
    const outputId=outputs[0]!.outputId;
    const production = await productionService.readProduction(ctx, outputId);
    if (!production) throw new Error("当前项目还没有可调整的制作记录。");
    const plan = (production.recordingConfig as Record<string, unknown> | null)?.videoEditingPlan as
      | Record<string, unknown>
      | undefined;
    if (!plan || typeof plan.revision !== "number") {
      throw new Error("当前项目还没有已确认的分镜方案，请先完成 AI 分场决策并确认。");
    }
    if(plan.editorVersion===1)throw new Error("请在制作工作台选中片段后调整，当前版本需要按片段逐项应用修改。");
    const parsed = videoRenderProps.safeParse(plan.renderProps);
    if (!parsed.success) throw new Error("当前剪辑方案已损坏，请回制作页重新确认分镜。");

    const props = structuredClone(parsed.data);
    const summary: string[] = [];
    const replacements = input.replaceBroll ?? [];
    if (replacements.length > 0) {
      const linkedAssetIds=new Set<string>();
      for(let page=1;;page++) {
        const batch=await materialLinksService.list(ctx,{projectId:input.projectId,page,pageSize:100});
        for(const link of batch.rows)if(link.entityType==="asset")linkedAssetIds.add(link.entityId);
        if(page*100>=batch.total || !batch.rows.length)break;
      }
      for (const replacement of replacements) {
        if (!linkedAssetIds.has(replacement.assetId)) {
          throw new Error(`素材 ${replacement.assetId} 不属于当前项目，请先上传或关联到“创作素材”。`);
        }
        await assetsService.getAsset(ctx, replacement.assetId);
      }
    }
    const removeIds = new Set(input.removeBrollAssetIds ?? []);
    if (removeIds.size > 0) {
      const before = props.broll.length;
      props.broll = props.broll.filter((item) => !removeIds.has(item.file));
      summary.push(`移除 ${before - props.broll.length} 条 B-roll`);
    }
    for (const replacement of replacements) {
      const scene = props.scenes[replacement.sceneIdx];
      if (!scene) throw new Error(`找不到第 ${replacement.sceneIdx + 1} 个场景。`);
      props.broll = props.broll.filter(
        (item) => item.at < scene.startSec || item.at >= scene.endSec,
      );
      props.broll.push({
        file: replacement.assetId,
        at: scene.startSec,
        durationSec: Math.max(0.2, Math.min(3, scene.endSec - scene.startSec)),
        label: "项目素材",
        big: false,
      });
      summary.push(`第 ${replacement.sceneIdx + 1} 场改用指定素材`);
    }
    for (const move of input.moveBroll ?? []) {
      const matches=props.broll.filter(item=>item.file===move.assetId);
      if(matches.length>1)throw new Error("该素材出现多次，请在制作工作台选中要调整的片段。");
      const found = matches[0];
      if (!found) throw new Error(`当前时间线里没有素材 ${move.assetId}。`);
      found.at = move.at;
      if (typeof move.durationSec === "number") found.durationSec = move.durationSec;
      summary.push(`调整素材 ${move.assetId} 的出现时间`);
    }
    const removeCards = new Set(input.removeCardIndexes ?? []);
    if (removeCards.size > 0) {
      let globalIndex = 0;
      let removed = 0;
      for (const scene of props.scenes) {
        scene.cards = scene.cards.filter(() => {
          const keep = !removeCards.has(globalIndex++);
          if (!keep) removed += 1;
          return keep;
        });
      }
      summary.push(`移除 ${removed} 张信息卡`);
    }
    if (summary.length === 0) {
      throw new Error("这条意见还没有形成可执行的剪辑改动，请明确要替换、移除或移动哪个素材/卡片。");
    }
    const verified = videoRenderProps.parse(props);
    return {
      kind: "video.edit" as const,
      projectId: input.projectId,
      outputId,
      expectedRevision: plan.revision,
      sourceRenderTaskId:
        typeof plan.sourceRenderTaskId === "string" ? plan.sourceRenderTaskId : null,
      instruction: input.instruction,
      summary,
      decisions:
        plan.decisions && typeof plan.decisions === "object"
          ? (plan.decisions as Record<string, unknown>)
          : {},
      renderProps: verified as unknown as Record<string, unknown>,
      error: null,
    };
 };
}
