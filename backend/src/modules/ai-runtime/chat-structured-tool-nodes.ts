import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, TopicCardOutput, PositioningSuggestionOutput } from "@creatoros/ai-worker";
import { EXTRA_BRIEF_HEADING } from "@creatoros/ai-worker/chat";
import type { ChatContext } from "./chat-context";
import { loadPositioningWorksBrief, type CreativeContext, type ContextDeps } from "./creative-context";
import type { ChatToolDeps } from "./chat-tools";
import { enrichFacets, normalizeCard } from "./topic-enrich-runner";
import { positioningFacets, normalizeSuggestion } from "./positioning-runner";

export type ChatStructuredContext = Pick<CreativeContext,"positioningBrief"|"accountsBrief"|"learningsBrief"|"signalsBrief"|"knowledgeBrief">;

type EnrichInput = Parameters<ChatToolDeps["enrichTopic"]>[0];
type PositioningInput = Parameters<ChatToolDeps["generatePositioning"]>[0];
export interface ChatStructuredNodePorts {
  resolveModelSpec(context: RequestContext, capability: string): Promise<ModelSpec>;
  runWithSkillSnapshot<T>(requiredSkillIds: readonly string[], execute: () => Promise<T>): Promise<T>;
  positioningWorks?: ContextDeps["positioningWorks"];
}
/** 可持久化的节点输入；不携带模型实例、凭据或执行闭包。 */
export type PreparedChatStructuredNode =
  | { capability: "topic.enrich"; facets: Record<string, string | undefined>; candidateId: string | null }
  | { capability: "calibration.diagnose"; facets: Record<string, string> }
  | { capability: "positioning.generate"; facets: Record<string, string | undefined> };

export async function prepareChatTopicEnrich(
  context: ChatStructuredContext,
  selection: ChatContext["selection"],
  input: EnrichInput,
): Promise<Extract<PreparedChatStructuredNode, { capability: "topic.enrich" }>> {
  const source = structuredClone({ context, selection, input });
  const { ANTI_FABRICATION_CLAUSE } = await import("@creatoros/ai-worker");
  const selectionTitle = source.selection?.label?.trim() || "";
  const title = (source.selection?.kind === "candidate" && selectionTitle) || source.input.title?.trim() || selectionTitle || "";
  const facets = enrichFacets(source.context, { title, angle: source.input.angle ?? "" });
  facets.knowledge = [facets.knowledge, source.input.verifiedBrief
    ? `【本轮联网核实素材(据实引用)】\n${source.input.verifiedBrief}`
    : "【素材诚实门】本轮未联网核实；没有真实素材时必须明确写未核实，禁止写待拉取占位承诺。", ANTI_FABRICATION_CLAUSE].filter(Boolean).join("\n\n");
  return { capability: "topic.enrich", facets, candidateId: source.selection?.kind === "candidate" ? source.selection.ids[0] ?? null : null };
}

export async function prepareChatPositioning(
  context: ChatStructuredContext,
  input: PositioningInput,
  readWorks: (limit?: number) => Promise<string>,
): Promise<Extract<PreparedChatStructuredNode, { capability: "positioning.generate" }>> {
  const source = structuredClone({ context, input });
  // SEMANTIC_BOUNDARY_ALLOW: 兼容既有用户明确选择的路径标记，仅落实 scratch 选择，不推断创作意图。
  const scratch = source.input.sourceMode === "scratch" || source.input.extraBrief?.includes("路径：完全从零开始") === true;
  const worksBrief = scratch ? "" : await readWorks(source.input.sourceMode ? 12 : undefined);
  const facets = scratch ? {
    current: "（本轮用户明确选择完全从零开始：禁止读取、引用或延续旧定位、账号画像与旧作品。）",
    accounts: "", works: "",
  } : positioningFacets(source.context, worksBrief);
  if (source.input.extraBrief?.trim()) facets.current = [facets.current, `${EXTRA_BRIEF_HEADING}\n${source.input.extraBrief.trim()}`].filter(Boolean).join("\n\n");
  return { capability: "positioning.generate", facets };
}

async function generate<T>(context: RequestContext, prepared: PreparedChatStructuredNode, ports: ChatStructuredNodePorts) {
  const { getTemplate, modelFor, runStructuredNode } = await import("@creatoros/ai-worker");
  const spec = await ports.resolveModelSpec(context, prepared.capability);
  return ports.runWithSkillSnapshot([prepared.capability], () => runStructuredNode<T>({ model: modelFor(spec), template: getTemplate(prepared.capability), facets: prepared.facets }));
}

/** 旧聊天也经同一准备与投影函数；专属模型和账号 Skill 不被主聊天模型替代。 */
export async function runChatTopicEnrich(
  context: RequestContext, creative: CreativeContext, selection: ChatContext["selection"], input: EnrichInput, ports: ChatStructuredNodePorts,
) {
  const owner = structuredClone(context);
  const prepared = await prepareChatTopicEnrich(creative, selection, input);
  const { object } = await generate<TopicCardOutput>(owner, prepared, ports);
  return { card: normalizeCard(object), candidateId: prepared.candidateId };
}

export async function runChatPositioning(
  context: RequestContext, creative: CreativeContext, input: PositioningInput, ports: ChatStructuredNodePorts,
) {
  const owner = structuredClone(context);
  const prepared = await prepareChatPositioning(creative, input, limit => loadPositioningWorksBrief(owner, ports.positioningWorks, limit));
  const { object } = await generate<PositioningSuggestionOutput>(owner, prepared, ports);
  return normalizeSuggestion(object);
}
