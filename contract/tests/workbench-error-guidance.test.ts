import {expect,it} from 'vitest';
import {workbenchErrorSchema,type WorkbenchCapability} from '../src/internal/agent-workbench';
import {workbenchToolOutcome} from '../src/internal/execution-worker';
const descriptor:WorkbenchCapability={name:'browser.act',schemaVersion:1,description:'受控页面操作',inputSchema:{type:'object'},resultSchema:{type:'object'},effects:['external_write'],requiredCapabilities:['task.browser'],platforms:['macos']};
it('已确认未派发的失败将有界修复说明交回Agent，未知动作仍只允许原操作对账',()=>{
 const error={code:'invalid_browser_action',retryable:false,dispatched:false,nextAction:'fix_input' as const,recovery:'点击需要 input.ref；元素引用来自最新 observe。'};
 expect(workbenchToolOutcome({operationId:'op',status:'failed',artifactRefs:[],progressCursor:null,error},descriptor)).toMatchObject({sideEffect:'none',error:{code:'invalid_input',recovery:error.recovery}});
 expect(workbenchErrorSchema.safeParse({...error,recovery:'a'.repeat(4001)}).success).toBe(false);
 expect(workbenchToolOutcome({operationId:'op',status:'unknown',artifactRefs:[],progressCursor:null,error:{...error,dispatched:true,nextAction:'reconcile',recovery:'重新点击'}},descriptor)).toMatchObject({sideEffect:'unknown',error:{code:'unknown_commit',recovery:'按原 operationId 核对回执后继续；不要重新执行。'}});
});
