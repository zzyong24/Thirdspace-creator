import {describe, expect, it, vi} from 'vitest';
import {createTaskFiles, versionConflictResult} from './task-files.js';

const context = {userId:'user-1', accountId:'account-1', taskId:'task-1', attempt:1, fenceToken:'fence-1', leaseId:'lease-1', operationId:'operation-1'};
const receipt = {operationId:'operation-1', status:'succeeded' as const, content:[{type:'text' as const,text:'ok'}], artifactRefs:[],progressCursor:null};

describe('task files trusted bridge', () => {
  it('passes trusted scope and validated Unicode path to the native host', async () => {
    const invoke=vi.fn().mockResolvedValue(receipt);
    const files=createTaskFiles({invoke});
    await expect(files(context,{operation:'write',path:'草稿/含 空格.md',content:'你好',expectedVersion:0})).resolves.toEqual(receipt);
    expect(invoke).toHaveBeenCalledWith(context,{operation:'write',path:'草稿/含 空格.md',content:'你好',expectedVersion:0});
  });
  it.each(['../other','a/../b','a//b','C:/Users/x','a\\b','/absolute','a:stream'])('rejects unsafe path %s before dispatch',async path=>{
    const invoke=vi.fn();
    await expect(createTaskFiles({invoke})(context,{operation:'read',path})).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('rejects model-supplied identity and stale context',async()=>{
    const invoke=vi.fn();
    await expect(createTaskFiles({invoke})(context,{operation:'read',path:'a',accountId:'other'})).rejects.toThrow();
    await expect(createTaskFiles({invoke})({...context,attempt:0},{operation:'read',path:'a'})).rejects.toThrow();
    expect(invoke).not.toHaveBeenCalled();
  });
  it('returns host conflict receipt without retrying or overwriting',async()=>{
    const conflict=versionConflictResult(context,2);
    const invoke=vi.fn().mockResolvedValue(conflict);
    await expect(createTaskFiles({invoke})(context,{operation:'edit',path:'a.md',content:'new',expectedVersion:1})).resolves.toEqual(conflict);
    expect(conflict.status==='failed' && conflict.error.code).toBe('version_conflict:2');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
