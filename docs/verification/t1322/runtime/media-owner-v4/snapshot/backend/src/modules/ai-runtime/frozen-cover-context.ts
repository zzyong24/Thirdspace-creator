import {isDeepStrictEqual} from "node:util";
import type { CoverContext } from "@creatoros/ai-worker/cover";

const fields = ["positioningBrief", "projectBriefHard", "reviewScript", "userMaterialHardBrief",
  "userMaterialRefBrief", "knowledgeBrief", "orientationHint"] as const;

/** Strictly read the server-frozen cover inputs. Legacy cover tasks omit this field. */
function readSnapshot(raw: unknown): CoverContext | null {
  if (raw === undefined) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("COVER_CONTEXT_SNAPSHOT_INVALID");
  const record = raw as Record<string, unknown>;
  const topic = record.topic;
  if (!topic || typeof topic !== "object" || Array.isArray(topic)) throw new Error("COVER_CONTEXT_SNAPSHOT_INVALID");
  const t = topic as Record<string, unknown>;
  if (typeof t.title !== "string" || typeof t.angle !== "string" ||
      fields.some((field) => typeof record[field] !== "string")) throw new Error("COVER_CONTEXT_SNAPSHOT_INVALID");
  return {positioningBrief: record.positioningBrief as string, projectBriefHard: record.projectBriefHard as string,
    reviewScript: record.reviewScript as string, userMaterialHardBrief: record.userMaterialHardBrief as string,
    userMaterialRefBrief: record.userMaterialRefBrief as string, knowledgeBrief: record.knowledgeBrief as string,
    orientationHint: record.orientationHint as string, topic: {title: t.title, angle: t.angle}};
}

export function readFrozenCoverContext(inputData: Record<string, unknown>): CoverContext | null {
  return readSnapshot(inputData.coverContextSnapshot);
}

export function readFrozenGraphicCardContext(inputData: Record<string, unknown>): CoverContext | null {
  return readSnapshot(inputData.cardContextSnapshot);
}

/** SEMANTIC_BOUNDARY_ALLOW: exact immutable page/style/source protocol identity only, no creative choice. */
export function graphicSeriesBasis(document: import('@creatoros/contract').GraphicPostDocument) {
  return {title:document.title,body:document.body,summary:document.summary,sourceRefs:document.sourceRefs,
    cardBriefs:document.cardBriefs??[],seriesProfile:document.seriesProfile??null};
}

export function graphicSeriesSnapshot(document: import('@creatoros/contract').GraphicPostDocument,targetCardId:string) {
  const cards=document.cardBriefs??[];
  if(cards.filter(card=>card.cardId===targetCardId).length!==1)throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
  return {targetCardId,cardBriefs:cards,seriesProfile:document.seriesProfile??null,sourceRefs:document.sourceRefs};
}

export function readFrozenGraphicSeries(input:Record<string,unknown>,document:import('@creatoros/contract').GraphicPostDocument) {
  if(input.targetSectionId===undefined){
    if(input.seriesSnapshot!==undefined)throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
    return null;
  }
  if(typeof input.targetSectionId!=='string')throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
  const expected=graphicSeriesSnapshot(document,input.targetSectionId);
  const raw=input.seriesSnapshot;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
  const {referenceProof,...basis}=raw as Record<string,unknown>;
  // SEMANTIC_BOUNDARY_ALLOW: canonical equality ignores JSONB key order but preserves exact page order and fields.
  if(!isDeepStrictEqual(basis,expected))throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
  if(expected.seriesProfile?.referenceImage && referenceProof===undefined)throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
  if(referenceProof!==undefined){
    const ref=expected.seriesProfile?.referenceImage,proof=referenceProof as Record<string,unknown>;
    if(!ref||!proof||proof.assetId!==ref.assetId||proof.assetFileId!==ref.assetFileId||typeof proof.checksum!=='string'||!/^[a-f0-9]{64}$/.test(proof.checksum)||typeof proof.mimeType!=='string'||!proof.mimeType.startsWith('image/'))throw new Error('GRAPHIC_CARD_GENERATION_BASE_MISMATCH');
  }
  return {...expected,...(referenceProof?{referenceProof}: {})};
}
