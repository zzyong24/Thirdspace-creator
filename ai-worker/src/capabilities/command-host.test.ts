import {describe, expect, it, vi} from 'vitest';
import {createCommandHost} from './command-host.js';
const context={userId:'u',accountId:'a',taskId:'t',attempt:1,fenceToken:'f',leaseId:'l',operationId:'o'};
const running={operationId:'o',status:'running' as const,content:[{type:'text' as const,text:'running'}],artifactRefs:[],progressCursor:'o'};

describe('command bridge',()=>{
  it('dispatches argv without a shell and keeps trusted scope',async()=>{
    const run=vi.fn().mockResolvedValue(running);
    const host=createCommandHost({run,status:vi.fn(),cancel:vi.fn()});
    await expect(host.run(context,{argv:['script.py','含 空格'],cwd:'草稿 1',runtimeId:'bundled-python',timeoutMs:60000})).resolves.toEqual(running);
    expect(run).toHaveBeenCalledWith(context,{argv:['script.py','含 空格'],cwd:'草稿 1',runtimeId:'bundled-python',timeoutMs:60000});
  });
  it('rejects extra runtime authority and malformed cwd before dispatch',async()=>{
    const run=vi.fn(); const host=createCommandHost({run,status:vi.fn(),cancel:vi.fn()});
    await expect(host.run(context,{argv:['-c','x'],cwd:'../escape',runtimeId:'bundled-node',timeoutMs:1000})).rejects.toThrow();
    await expect(host.run(context,{argv:['-c','x'],cwd:'.',runtimeId:'bundled-node',timeoutMs:1000,env:{SECRET:'x'}})).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it('scopes status and cancellation to current trusted operation',async()=>{
    const status=vi.fn().mockResolvedValue(running),cancel=vi.fn().mockResolvedValue(running);
    const host=createCommandHost({run:vi.fn(),status,cancel});
    await host.status(context); await host.cancel(context);
    expect(status).toHaveBeenCalledWith(context); expect(cancel).toHaveBeenCalledWith(context);
  });
});
