import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createDb,aiTasks,aiMessages,aiTaskResults,executionCalls,eq} from '/Users/zyongzhu/.codex/worktrees/user-diagnostics/Thirdspace-creator/backend/src/index.ts';
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const input='/tmp/t1060-ai-business/default-codex-v2-image-evidence.json';
const evidence=JSON.parse(await readFile(input,'utf8'));
assert.equal(evidence.outcome,'passed');
const opened=await createDb({dataDir:join(evidence.isolatedRoot,'db')});
try{
 const [task]=await opened.db.select().from(aiTasks).where(eq(aiTasks.id,evidence.taskId));assert.ok(task);assert.equal(task.status,'succeeded');assert.equal(task.projectId,evidence.projectId);
 const [message]=await opened.db.select().from(aiMessages).where(eq(aiMessages.id,evidence.committed.messageId));assert.ok(message);assert.equal(message.role,'assistant');assert.equal(message.content,evidence.assistantText);
 const metadata=message.modelMetadata as any;assert.equal(metadata.sessionId,evidence.sessionId);assert.equal(metadata.providerTurnId,evidence.providerTurnId);assert.equal(metadata.chatTaskId,evidence.taskId);
 const cards=(message.parts as any[]).filter(p=>p.type==='tool-native.image');assert.equal(cards.length,evidence.imageSaves.length);
 for(const image of evidence.imageSaves){const key=`chat-image-${hash(JSON.stringify([image.callId,image.toolCallId,image.imageIndex]))}`;assert.ok(cards.some(p=>p.toolCallId===key&&p.output.asset.id===image.receipt.assetId&&p.output.fileId===image.receipt.fileId));const bytes=await readFile(image.path);assert.equal(hash(bytes),image.receipt.checksum);assert.equal(bytes.byteLength,image.receipt.byteLength);}
 const [result]=await opened.db.select().from(aiTaskResults).where(eq(aiTaskResults.id,evidence.committed.resultId));assert.ok(result);assert.equal(result.executionCallId,evidence.imageSaves[0].callId);assert.equal(result.resultType,'conversation_reply');
 const [call]=await opened.db.select().from(executionCalls).where(eq(executionCalls.id,result.executionCallId!));assert.equal(call?.status,'settled');assert.equal((call?.providerResult as any).providerTurnId,evidence.providerTurnId);
 const report={observedAt:new Date().toISOString(),outcome:'passed',verification:'persisted-native-image-chat-card-readback',taskId:evidence.taskId,executionTaskId:evidence.executionTaskId,assistantMessageId:message.id,resultId:result.id,executionCallId:result.executionCallId,sessionId:metadata.sessionId,providerTurnId:metadata.providerTurnId,cards:cards.map(p=>({type:p.type,toolCallId:p.toolCallId,state:p.state,assetId:p.output.asset.id,fileId:p.output.fileId})),checks:{originalCommitNativeImageCardPersisted:true,chatResultCallIdentityLinked:true,modelTurnMetadataMatches:true,actualPngArtifactByteChecksum:true},adopted:false,published:false};
 await writeFile('/tmp/t1060-ai-business/default-codex-v2-card-readback.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await opened.client.close();}
