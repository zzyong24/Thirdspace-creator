import {it,expect,vi} from 'vitest';
const localFetch=vi.hoisted(()=>vi.fn(async()=>({body:{cancel:vi.fn()}})));
vi.mock('./http-transport',()=>({fetchCreatorApi:localFetch}));
import {captureBrowserException} from './observability-client';
it('Page producer keeps one original exception identity, bounded context and trusted local ingress only',async()=>{
 const error=new Error('假异常中文💥'.repeat(3000));error.stack=('at fake (fixture.ts:1:1)\\n中文💥').repeat(5000);
 captureBrowserException(error,'fixture-123');captureBrowserException(error,'fixture-123');
 await Promise.resolve();expect(localFetch).toHaveBeenCalledTimes(1);
 const [target,request,scope]=localFetch.mock.calls[0] as unknown as [string,{body:string,signal:AbortSignal},unknown];
 expect(target).toBe('/api/v1/local/observability');expect(new TextEncoder().encode(request.body).byteLength).toBeLessThanOrEqual(32768);
 const actual=JSON.parse(request.body);expect(actual).toEqual(expect.objectContaining({module:'ui',referenceId:'fixture-123',code:'UNCLASSIFIED_EXCEPTION'}));expect(actual.stack).toContain('fixture.ts');expect(scope).toEqual({includeCurrentAccount:false});expect(request.signal.aborted).toBe(false);
});
