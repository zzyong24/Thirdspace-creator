import {and,eq,isNull,aiTasks,projects,type Db} from "../index";
import {isDeepStrictEqual} from "node:util";
import {workspaceFilter} from "../workspace-scope";
import {assertFrozenWorkspaceMembership} from "../modules/platform-account/membership-lock.service";
import {OwnershipError,ConflictError} from "../errors";
import {createAiRepository,type AiArtifactsPort} from "../modules/ai";
import {createArtifactsService} from "../modules/artifacts";

/** 用户采纳论点的原子工作单元；固定冻结workspace→项目→任务锁顺序，复用领域 service 写版本。 */
export function createThesisAdoption(db:Db,deps:{now:()=>string;nextId:(prefix:string)=>string}):NonNullable<AiArtifactsPort["adoptThesisCandidate"]>{
 return async(ctx,input)=>{
        await db.transaction(async (transaction) => {
          const txDb = transaction as unknown as Db;
          const [original] = await transaction.select().from(aiTasks).where(and(
            eq(aiTasks.id,input.taskId),eq(aiTasks.userId,ctx.userId),workspaceFilter(aiTasks,ctx),
          ));
          if(!original)throw new OwnershipError("AI task not found");
          const frozen={userId:original.userId,groupId:original.groupId,accountId:original.accountId,groupVersion:original.groupVersion,membershipVersion:original.membershipVersion};
          // 原任务身份的账号→member→组锁必须在本事务项目→任务锁之前，不锁页面筛选账号。
          await assertFrozenWorkspaceMembership(transaction,frozen);
          const [project] = await transaction.select().from(projects).where(and(
            eq(projects.id,input.projectId),eq(projects.userId,ctx.userId),workspaceFilter(projects,ctx),
          )).for("update");
          if(!project)throw new OwnershipError("Project not found");
          const [locked] = await transaction.select().from(aiTasks).where(and(
            eq(aiTasks.id,input.taskId),eq(aiTasks.userId,frozen.userId),
            frozen.groupId?eq(aiTasks.groupId,frozen.groupId):isNull(aiTasks.groupId),
            frozen.accountId?eq(aiTasks.accountId,frozen.accountId):isNull(aiTasks.accountId),
          )).for("update");
          if(!locked||locked.groupVersion!==frozen.groupVersion||locked.membershipVersion!==frozen.membershipVersion||locked.executionTaskId!==original.executionTaskId||locked.leaseToken!==original.leaseToken)throw new ConflictError("论点任务冻结归属已改变");
          const txAiRepo = createAiRepository(txDb, {
            now: deps.now,
            nextId: deps.nextId,
            userId: ctx.userId,
            accountId:frozen.accountId,
            groupId:frozen.groupId,
          });
          const lockedTask = await txAiRepo.requireTask(input.taskId);
          if (lockedTask.status === "succeeded") return;
          if (
            lockedTask.status !== "awaiting_confirmation" ||
            lockedTask.taskType !== "planning.thesis" ||
            lockedTask.projectId !== input.projectId
          ) {
            throw new Error(
              `planning.thesis adoption state mismatch: ${lockedTask.status}`,
            );
          }

          const candidate=(await txAiRepo.listResults(input.taskId)).at(-1);
          const data=(candidate?.resultData??{}) as Record<string,unknown>;
          const content=data.contentData&&typeof data.contentData==='object'&&!Array.isArray(data.contentData)?data.contentData as Record<string,unknown>:null;
          if(candidate?.resultType!=='artifact_version'||data.body!==input.contentText||!content||!isDeepStrictEqual({...content,scriptBasis:{status:'adopted'}},input.contentData)||(typeof data.summary==='string'?data.summary:'AI 论点候选')!==input.changeSummary)throw new ConflictError("论点候选与原确认内容不符");
          const txArtifacts = createArtifactsService({
            db: txDb,
            now: deps.now,
            nextId: deps.nextId,
            assertProjectOwned:async(scope,projectId)=>{
              if(projectId!==project.id||scope.userId!==ctx.userId||(scope.groupId??null)!==(ctx.groupId??null)||(scope.accountId??null)!==(ctx.accountId??null))throw new OwnershipError("Project not found");
            },
          });
          const projectArtifacts = await txArtifacts.listProjectArtifacts(
            ctx,
            input.projectId,
          );
          const thesisArtifact =
            projectArtifacts.find(
              (artifact) => artifact.artifactType === "thesis_tree",
            ) ??
            (await txArtifacts.createArtifact(ctx, {
              projectId: input.projectId,
              title: "论点骨架",
              artifactType: "thesis_tree",
              stage: "planning",
            }));
          const versions = await txArtifacts.listVersions(ctx, thesisArtifact.id);
          const existing = versions.find(
            (version) => version.aiTaskId === input.taskId,
          );
          if (existing) {
            if (thesisArtifact.currentVersionId !== existing.id) {
              await txArtifacts.restoreVersion(
                ctx,
                thesisArtifact.id,
                existing.id,
              );
            }
          } else {
            await txArtifacts.createVersion(ctx, thesisArtifact.id, {
              contentText: input.contentText,
              changeSummary: input.changeSummary,
              contentData: input.contentData,
              createdByType: "ai",
              aiTaskId: input.taskId,
            });
          }
          await txAiRepo.updateTaskStatus(input.taskId, {
            status: "succeeded",
            completedAt: deps.now(),
          });
        });

 };
}
