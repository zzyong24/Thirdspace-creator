"use client";
import {useCreationScope,useCreationWorkspace} from "@/lib/creation-workspace-scope";
import * as React from "react";
import {client} from "@/lib/contract-client";
import {uploadProductionAsset,type WireProduction} from "./production-resource-operations";
import type {ProductionStatus} from "./production-flow";
interface DeliveryInput {
 projectId:string;outputId:string|null;status:string|null;finalVideoAssetId:string|null;renderOrientation:"portrait"|"landscape";
 readVideoDuration(file:File):Promise<number|null>;ensureOutputId():Promise<string>;advanceStatus(target:ProductionStatus):Promise<string|null>;
 renderDimensions?:{width:number;height:number};
 setFinalVideoAssetId:React.Dispatch<React.SetStateAction<string|null>>;
}
/** 成品上传及素材包导出使用现有业务端口；发布覆盖门与逐步状态推进保持原语义。 */
export function useProductionDelivery({projectId,outputId,status,finalVideoAssetId,renderOrientation,readVideoDuration,ensureOutputId,advanceStatus,setFinalVideoAssetId,renderDimensions}:DeliveryInput){
 const workspace=useCreationWorkspace(useCreationScope()),client=workspace.client;
 const lifetime=React.useRef(0),alive=React.useRef(false);React.useEffect(()=>{alive.current=true;lifetime.current++;return()=>{alive.current=false;lifetime.current++;};},[workspace,projectId,outputId]);

  const [method, setMethod] = React.useState<"creatoros" | "upload">(
    "creatoros",
  );
  const [finalBusy, setFinalBusy] = React.useState(false);
  const [finalError, setFinalError] = React.useState<string | null>(null);
  const [finalNotice, setFinalNotice] = React.useState<string | null>(null);
  // 已有成片时的替换确认门(§4.1:已 ready 覆盖需二次确认,不静默丢)。
  const [replaceOk, setReplaceOk] = React.useState(false);
  // §5.1③:成片已被 publication 登记 → 禁覆盖(null=未探测/无需探测)。
  const [pubLocked, setPubLocked] = React.useState<boolean | null>(null);

  // ── [T-366b] 素材包导出 ─────────────────────────────────────────────────────
  const [exportBusy, setExportBusy] = React.useState(false);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const [exportDone, setExportDone] = React.useState<{
    fileName: string;
    fileCount: number;
    hasDecisions: boolean;
  } | null>(null);
  // 预计大小(项目素材 fileSize 求和;读不到就不提示,不编数)。
  const [estBytes, setEstBytes] = React.useState<number | null>(null);

  const hasExistingFinal = Boolean(finalVideoAssetId || status === "ready");
  React.useEffect(() => {
    if (method !== "upload" || !outputId || !hasExistingFinal) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 离开探测语境时复位(同 FinalVideoPreview 复位先例)
      setPubLocked(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pubs = (await client.listPublications({
          params: { outputId },
          query: { page: 1, pageSize: 50 },
          body: undefined,
        })) as unknown as ReadonlyArray<{ id: string }>;
        if (!cancelled) setPubLocked(pubs.length > 0);
      } catch {
        if (!cancelled) setPubLocked(null); // 探测失败 → 上传时再兜一次
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [method, outputId, hasExistingFinal]);

  const onFinalFile = React.useCallback(
    async (file: File) => {
      const operation=workspace.capture(),generation=lifetime.current;const check=()=>{operation.assertCurrent();if(!alive.current||generation!==lifetime.current)throw new DOMException("作品已变化","AbortError");};const current=()=>{try{check();return true;}catch{return false;}};check();const client=operation.client;
      setFinalError(null);
      setFinalNotice(null);
      // 基本校验(§5.1⑤):格式收窄 mp4/mov + 可读时长探针,坏文件诚实拒收不直登 ready。
      const isMp4Mov =
        /\.(mp4|mov)$/i.test(file.name) ||
        file.type === "video/mp4" ||
        file.type === "video/quicktime";
      if (!isMp4Mov) {
        setFinalError("成品只收 mp4 / mov 格式 —— 请从剪辑软件导出后再上传。");
        return;
      }
      setFinalBusy(true);
      try {
        const durationSec=await readVideoDuration(file);check();
        if (durationSec == null || durationSec <= 0) {
          setFinalError(
            "读不出有效时长(文件可能损坏或不是视频)—— 已拒收,请检查文件后重试。",
          );
          return;
        }
        // §5.1③ 禁覆盖:已有成片且该产出已被 publication 登记 → 不覆盖已登记事实。
        if (hasExistingFinal && outputId) {
          let locked = pubLocked;
          if (locked === null) {
            try {
              const pubs = (await client.listPublications({
                params: { outputId },
                query: { page: 1, pageSize: 50 },
                body: undefined,
              })) as unknown as ReadonlyArray<{ id: string }>;
              locked = pubs.length > 0;
            } catch {
              locked = null; // 探测不到 → 保守放行(登记事实在服务端仍不可变)
            }
          }
          if (locked) {
            setPubLocked(true);
            setFinalError(
              "当前成片已登记过发布 —— 不能覆盖已登记的事实。请先在发布面解除登记,或新建产出再上传。",
            );
            return;
          }
        }
        // 复用两阶段上传链(role=final,与粗剪 clip / B-roll 隔离)。
        const assetId = await uploadProductionAsset(
          projectId,
          file,
          "video",
          "final",operation,
        );
        // 状态机跳转语义(SPEC §5 待决点 1,选「补记中间态」):后端 putProduction 只接受
        // 相邻 +1(跨步 → ConflictError),不为本路径开非相邻跳 —— 复用 statusStepsTo 依次
        // PUT recording→editing→rendering(advanceStatus 内部逐步),语义零改动。
        check();const productionId=await advanceStatus("rendering");check();
        if (!productionId) {
          throw new Error("production 状态机推进失败,请重试");
        }
        // 复用既有导出范式:export 建档(queued)→ completeExport(resultAssetId=成品)。
        // completeExport 的后端 fan-out 会把成品挂为 output primary asset —— 发布登记 /
        // 盲预测 / 发布物料链照常(§5.1⑤ 飞轮不脱钩)。
        const exp = (await client.createProductionExport({
          params: { productionId },
          query: undefined,
          body: {
            format: "mp4",
            resolution:
              renderDimensions ? `${renderDimensions.width}x${renderDimensions.height}` : renderOrientation === "portrait" ? "1080x1920" : "1920x1080",
            aspectRatio:
              renderDimensions ? `${renderDimensions.width}:${renderDimensions.height}` : renderOrientation === "portrait" ? "9:16" : "16:9",
          },
        })) as unknown as { id: string };
        await client.completeExport({
          params: { exportId: exp.id },
          query: undefined,
          body: { resultAssetId: assetId },
        });
        await advanceStatus("ready");check();
        setFinalVideoAssetId(assetId);
        setReplaceOk(false);
        setFinalNotice(
          `成品「${file.name}」已登记为本项目成片(export ready)。盲预测 / 发布物料 / 登记发布照常可用。`,
        );
      } catch (err) {
        if(!current())return;setFinalError(
          err instanceof Error ? err.message : "成品上传失败,请重试",
        );
      } finally {
        if(current())setFinalBusy(false);
      }
    },
    [
      projectId,
      readVideoDuration,
      advanceStatus,
      renderOrientation,
      renderDimensions,
      hasExistingFinal,
      outputId,
      pubLocked,workspace,
    ],
  );

  // ── [T-366b] 素材包导出(辅助入口)────────────────────────────────────────────
  // 预计大小:项目素材 fileSize 求和(asset 投影自带 fileSize;读不到就不提示,不编数)。
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const links = (await client.listMaterialLinks({
          params: undefined,
          query: { projectId, page: 1, pageSize: 100 },
          body: undefined,
        })) as unknown as ReadonlyArray<{ entityType: string; entityId: string }>;
        const assetIds = links
          .filter((l) => l.entityType === "asset")
          .map((l) => l.entityId);
        let sum = 0;
        let any = false;
        for (const id of assetIds) {
          try {
            const a = (await client.getAsset({
              params: { assetId: id },
              query: undefined,
              body: undefined,
            })) as unknown as { fileSize: number | null };
            if (typeof a.fileSize === "number") {
              sum += a.fileSize;
              any = true;
            }
          } catch {
            /* 单条读不到跳过 */
          }
        }
        if (!cancelled && any) setEstBytes(sum);
      } catch {
        /* 估算失败 → 不显示提示(诚实跳过) */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const onExportMaterials = React.useCallback(async () => {
    const operation=workspace.capture(),generation=lifetime.current;const check=()=>{operation.assertCurrent();if(!alive.current||generation!==lifetime.current)throw new DOMException("作品已变化","AbortError");};const current=()=>{try{check();return true;}catch{return false;}};check();const client=operation.client;
    setExportBusy(true);
    setExportError(null);
    setExportDone(null);
    try {
      const oid = await ensureOutputId();check();
      const prod = (await client.getOutputProduction({
        params: { outputId: oid },
        query: undefined,
        body: undefined,
      })) as unknown as WireProduction;
      const res = (await client.exportProductionMaterials({
        params: { productionId: prod.id },
        query: undefined,
        body: undefined,
      })) as unknown as {
        downloadUrl: string;
        fileName: string;
        fileCount: number;
        hasDecisions: boolean;
      };
      check();setExportDone(res);
      // 经既有签名下载 URL 通道触发浏览器下载。
      const a = document.createElement("a");
      a.href = res.downloadUrl;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      if(!current())return;setExportError(
        err instanceof Error ? err.message : "素材包导出失败,请重试",
      );
    } finally {
      if(current())setExportBusy(false);
    }
  }, [ensureOutputId,workspace]);

  return {method,setMethod,finalBusy,finalError,finalNotice,setFinalNotice,replaceOk,setReplaceOk,pubLocked,exportBusy,exportError,exportDone,estBytes,hasExistingFinal,onFinalFile,onExportMaterials};
}
