import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";
import { isAccountRequiredError, readCurrentAccountId } from "@/lib/http-transport";
import { WORK_CHOICES, supportsWorkPlatform, type WorkType, type WorkPlatform } from "./work-type-fields";
import type { NewProjectFormValues } from "./new-project-form";
import type { ProjectWorkOutput } from "./project-output-home";

type Project = {id: string; title: string};
type OutputBody = {title: string; contentType: WorkType; targetPlatform?: WorkPlatform; clientRequestId: string};
interface CreationPorts {
  readAccountId: () => string | null;
  verifyAccount: (id: string) => Promise<void>;
  prepareBrief?: (brief: string) => Promise<string>;
  createProject: (body: {title: string; brief: string}) => Promise<Project>;
  createOutput: (projectId: string, body: OutputBody) => Promise<ProjectWorkOutput>;
}
export class ProjectCreationError extends Error {
  constructor(message: string, readonly needsAccount = false) {
    super(message);
    this.name = "ProjectCreationError";
  }
}
const ACCOUNT_HINT = "请先添加或选择一个创作账号，再继续创建。";
function accountError(error: unknown): boolean {
  return isAccountRequiredError(error) || Boolean((error as {needsAccount?: boolean} | null)?.needsAccount);
}

/** UI 命令协调：复用原服务的逐作品幂等回执，不取得业务数据所有权。 */
export function createProjectCreationSession(ports: CreationPorts) {
  let project: Project | null = null;
  let accountId: string | null = null;
  let frozenDigest: string | null = null;
  let projectUnknown = false;
  let inFlight = false;
  const requests = new Map<WorkType, {body: OutputBody; output?: ProjectWorkOutput}>();
  function snapshot() {
    return {project, outputs: WORK_CHOICES.flatMap(choice => {
      const output = requests.get(choice.id)?.output;
      return output ? [output] : [];
    })};
  }
  function checkAccount() {
    const current = ports.readAccountId();
    if (accountId && current !== accountId) throw new ProjectCreationError("账号已切换，请回到原账号继续创建；当前项目与输入已保留。");
    if (!current) throw new ProjectCreationError(ACCOUNT_HINT, true);
    return current;
  }
  async function create(values: NewProjectFormValues) {
    if (inFlight) throw new ProjectCreationError("正在创建，请等待当前操作完成。");
    const types = WORK_CHOICES.filter(choice => values.contentTypes.includes(choice.id)).map(choice => choice.id);
    if (!values.name.trim() || types.length === 0) throw new ProjectCreationError("请填写主题，并至少选择一种作品形式。");
    if (projectUnknown) throw new ProjectCreationError("创建结果尚未确认，请先在项目列表核对是否已创建，再开始新的创建。");
    const digest = JSON.stringify({title: values.name.trim(), brief: values.brief, types, platform: values.targetPlatform ?? null});
    if (frozenDigest && digest !== frozenDigest) throw new ProjectCreationError("请先使用原主题和作品选择重试，已创建的项目和稿件会保留。");
    inFlight = true;
    try {
      const current = checkAccount();
      try {await ports.verifyAccount(current);} catch (error) {
        if (accountError(error) || (error as {status?: number} | null)?.status === 404) throw new ProjectCreationError(ACCOUNT_HINT, true);
        throw error;
      }
      // 验证期间切号也不能把下一次写交给新账号。
      if (ports.readAccountId() !== current) throw new ProjectCreationError("账号已切换，请重新核对创作账号后再创建。");
      accountId = current;
      if (!project) {
        const brief = ports.prepareBrief ? await ports.prepareBrief(values.brief) : values.brief;
        checkAccount();
        try {project = await ports.createProject({title: values.name.trim(), brief});} catch (error) {
          const status = (error as {status?: number} | null)?.status;
          if (!status || status >= 500) {
            projectUnknown = true;
            throw new ProjectCreationError("创建结果尚未确认，请先在项目列表核对是否已创建，再开始新的创建。");
          }
          accountId = null;
          if (accountError(error)) throw new ProjectCreationError(ACCOUNT_HINT, true);
          throw error;
        }
        frozenDigest = digest;
      }
      const failed: string[] = [];
      for (const type of types) {
        checkAccount();
        let request = requests.get(type);
        if (!request) {
          request = {body: {title: values.name.trim(), contentType: type,
            ...(values.targetPlatform && supportsWorkPlatform(type, values.targetPlatform) ? {targetPlatform: values.targetPlatform} : {}),
            clientRequestId: crypto.randomUUID()}};
          requests.set(type, request);
        }
        if (request.output) continue;
        try {request.output = await ports.createOutput(project.id, request.body);} catch (error) {
          if (accountError(error)) throw new ProjectCreationError(ACCOUNT_HINT, true);
          // 真实回执未知也保留同键同参数；其余已选类型仍可继续创建。
          failed.push(WORK_CHOICES.find(choice => choice.id === type)!.label);
        }
      }
      checkAccount();
      if (failed.length) throw new ProjectCreationError(`项目已建立，${failed.join("、")}未完成；请按原输入重试，已有稿件会保留。`);
      return {project, outputs: snapshot().outputs, accountId};
    } catch (error) {
      if (error instanceof ProjectCreationError) throw error;
      if (accountError(error)) throw new ProjectCreationError(ACCOUNT_HINT, true);
      throw new ProjectCreationError(describeUserError(error, "创建未完成，输入已保留。请重试。"));
    } finally {inFlight = false;}
  }
  return {create, snapshot};
}

export function createBrowserProjectCreationSession(source?: {sourceItemId?: string; sourceType?: "video" | "article" | "trend_signal"}) {
  return createProjectCreationSession({
    readAccountId: readCurrentAccountId,
    verifyAccount: async id => {
      const account = await client.getAccount({params: {accountId: id}, query: undefined, body: undefined}) as {status: string};
      if (account.status !== "active") throw new ProjectCreationError(ACCOUNT_HINT, true);
    },
    ...(source?.sourceItemId ? {prepareBrief: async (brief: string) => {
      const detail = await client.getIntelligenceItem({params:{itemId:source.sourceItemId!},query:undefined,body:undefined});
      // SEMANTIC_BOUNDARY_ALLOW: 按已有抓取回执协议读取用户明确选择的来源，不归类或改写内容。
      const snapshot = [...detail.snapshots].sort((a,b)=>b.capturedAt.localeCompare(a.capturedAt)).find(item=>item.safeExtract?.trim());
      const text = source.sourceType === "video" ? (detail.transcript.status === "done" ? detail.transcript.text : null)
        : snapshot?.safeExtract || (detail.transcript.status === "done" ? detail.transcript.text : null);
      const reference = text?.trim() ? text.slice(0,60000) + (text.length>60000 ? "\n（资料较长，仅提供前60000字，后续内容未提供，不得推断。）" : "")
        : "所选来源正文暂不可读取；仅有标题不能当作已读原文，不得编造来源内容。";
      return [brief, `参考资料：${detail.item.title || "内容雷达所选内容"}`, reference].filter(Boolean).join("\n\n");
    }} : {}),
    createProject: async body => await client.createProject({params: undefined, query: undefined, body}) as Project,
    createOutput: async (projectId, body) => await client.createOutput({params: {projectId}, query: undefined, body}) as ProjectWorkOutput,
  });
}
