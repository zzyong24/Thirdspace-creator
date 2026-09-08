import {sql,type Db} from "../index";
import {requireAccountId,OwnershipError} from "../errors";
import {createAiRepository,type AiArtifactsPort} from "../modules/ai";
import {createArtifactsService} from "../modules/artifacts";

/** 用户采纳论点的原子工作单元；固定项目→任务锁顺序，复用领域 service 写版本。 */
export function createThesisAdoption(db:Db,deps:{now:()=>string;nextId:(prefix:string)=>string}):NonNullable<AiArtifactsPort["adoptThesisCandidate"]>{
 return async(ctx,input)=>{
        const accountId = requireAccountId(
          ctx.accountId,
          "ai.adoptThesisCandidate",
        );
        await db.transaction(async (transaction) => {
          const txDb = transaction as unknown as Db;
          // 先锁项目，再锁任务：同一项目的并发确认按固定顺序串行，避免铸出两个 thesis_tree。
          const projectLock = await txDb.execute(sql`
            SELECT id
            FROM projects
            WHERE id = ${input.projectId}
              AND user_id = ${ctx.userId}
              AND account_id = ${accountId}
            FOR UPDATE
          `);
          if (projectLock.rows.length === 0) {
            throw new OwnershipError("Project not found");
          }
          await txDb.execute(sql`
            SELECT id
            FROM ai_tasks
            WHERE id = ${input.taskId}
              AND user_id = ${ctx.userId}
              AND account_id = ${accountId}
            FOR UPDATE
          `);

          const txAiRepo = createAiRepository(txDb, {
            now: deps.now,
            nextId: deps.nextId,
            userId: ctx.userId,
            accountId,
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

          const txArtifacts = createArtifactsService({
            db: txDb,
            now: deps.now,
            nextId: deps.nextId,
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
