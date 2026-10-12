import {it,expect,vi} from 'vitest';
const localFetch=vi.hoisted(()=>vi.fn(async()=>({body:{cancel:vi.fn()}})));
vi.mock('./http-transport',()=>({fetchCreatorApi:localFetch}));
import {captureBrowserException, ObservabilityClient} from './observability-client';
import {createElement} from 'react';
import {render, waitFor} from '@testing-library/react';
it('Page producer keeps one original exception identity, bounded context and trusted local ingress only',async()=>{
 const error=new Error('假异常中文💥'.repeat(3000));error.stack=('at fake (fixture.ts:1:1)\\n中文💥').repeat(5000);
 captureBrowserException(error,'fixture-123');captureBrowserException(error,'fixture-123');
 await Promise.resolve();expect(localFetch).toHaveBeenCalledTimes(1);
 const [target,request,scope]=localFetch.mock.calls[0] as unknown as [string,{body:string,signal:AbortSignal},unknown];
 expect(target).toBe('/api/v1/local/observability');expect(new TextEncoder().encode(request.body).byteLength).toBeLessThanOrEqual(32768);
 const actual=JSON.parse(request.body);expect(actual).toEqual(expect.objectContaining({module:'ui',referenceId:'fixture-123',code:'UNCLASSIFIED_EXCEPTION'}));expect(actual.stack).toContain('fixture.ts');expect(scope).toEqual({includeCurrentAccount:false});expect(request.signal.aborted).toBe(false);
});

it('原浏览器状态事件仅单在途发往本地端口，离线与快速变化不向Growth探测',async()=>{
 localFetch.mockClear();const descriptor=Object.getOwnPropertyDescriptor(navigator,'onLine');let resolveFirst!: (value:unknown)=>void;
 localFetch.mockImplementationOnce(()=>new Promise(resolve=>{resolveFirst=resolve}) as never);Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
 const mounted=render(createElement(ObservabilityClient));try{
  expect(localFetch).toHaveBeenCalledTimes(1);const [url,request]=localFetch.mock.calls[0] as unknown as [string,{body:string}];expect(url).toBe('/api/v1/local/observability');expect(JSON.parse(request.body)).toEqual({kind:'connectivity',online:false});
  Object.defineProperty(navigator,'onLine',{configurable:true,value:true});window.dispatchEvent(new Event('online'));expect(localFetch).toHaveBeenCalledTimes(1);
  resolveFirst({body:{cancel:()=>Promise.resolve()}});await waitFor(()=>expect(localFetch).toHaveBeenCalledTimes(2),{timeout:120000});
  expect(JSON.parse((localFetch.mock.calls[1] as unknown as [string,{body:string}])[1].body)).toEqual({kind:'connectivity',online:true});
 }finally{mounted.unmount();if(descriptor)Object.defineProperty(navigator,'onLine',descriptor);else delete (navigator as unknown as {onLine?:boolean}).onLine;}
});
