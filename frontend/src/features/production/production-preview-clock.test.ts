import {afterEach,expect,it,vi} from "vitest";
import {withPreviewBridge} from "./production-preview-bridge";
afterEach(()=>{window.dispatchEvent(new Event("pagehide"));document.body.innerHTML="";vi.restoreAllMocks();vi.unstubAllGlobals();});
it("预览沿主轨实例定位源偏移并在切点切换，不用第一原片时间冒充成片时间",async()=>{
 document.body.innerHTML='<video id="th" class="clip talking-head" data-start="0" data-duration="1" data-media-start="5"></video><video id="th-1" class="clip talking-head" data-start="1" data-duration="1" data-media-start="9"></video>';
 const videos=[...document.querySelectorAll("video")],calls=videos.map(()=>vi.fn(async()=>{}));
 videos.forEach((v,i)=>{Object.defineProperty(v,"readyState",{value:4});Object.defineProperty(v,"paused",{value:true,configurable:true});v.play=calls[i]!;v.pause=vi.fn();});
 Object.defineProperty(document,"fonts",{value:{ready:Promise.resolve()},configurable:true});
 (window as unknown as {__timelines:unknown}).__timelines={main:{pause:vi.fn(),seek:vi.fn()}};
 let raf:FrameRequestCallback|undefined;vi.stubGlobal("requestAnimationFrame",(cb:FrameRequestCallback)=>{raf=cb;return 1;});vi.stubGlobal("cancelAnimationFrame",vi.fn());
 const html=withPreviewBridge('<body></body></html>',"channel",2),script=html.slice(html.indexOf('<script>')+8,html.indexOf('</script>'));window.eval(script);
 await Promise.resolve();await Promise.resolve();
 const command=(commandId:number,type:string,time?:number)=>window.dispatchEvent(new MessageEvent("message",{source:window.parent,data:{channelId:"channel",commandId,type,time}}));
 command(1,"seek",1.25);expect(videos[1]!.currentTime).toBe(9.25);expect(videos[0]!.style.visibility).toBe("hidden");
 command(2,"seek",.5);expect(videos[0]!.currentTime).toBe(5.5);
 command(3,"play");await Promise.resolve();await Promise.resolve();videos[0]!.currentTime=6;raf?.(0);await Promise.resolve();await Promise.resolve();
 expect(videos[1]!.currentTime).toBe(9);expect(calls[1]).toHaveBeenCalled();
 command(4,"pause");expect(videos[1]!.pause).toHaveBeenCalled();
});
it("等待片段加载时暂停和卸载立即清理计时器，迟到加载不重启播放",async()=>{
 vi.useFakeTimers();document.body.innerHTML='<video id="th" class="clip talking-head" data-start="0" data-duration="1"></video>';
 const video=document.querySelector("video")!;Object.defineProperty(video,"readyState",{value:0});video.play=vi.fn(async()=>{});video.pause=vi.fn();Object.defineProperty(document,"fonts",{value:{ready:Promise.resolve()},configurable:true});
 (window as unknown as {__timelines:unknown}).__timelines={main:{pause:vi.fn(),seek:vi.fn()}};vi.stubGlobal("cancelAnimationFrame",vi.fn());
 const html=withPreviewBridge('<body></body></html>',"waiting",1);window.eval(html.slice(html.indexOf('<script>')+8,html.indexOf('</script>')));
 const command=(commandId:number,type:string)=>window.dispatchEvent(new MessageEvent("message",{source:window.parent,data:{channelId:"waiting",commandId,type}}));
 try{await vi.advanceTimersByTimeAsync(0);const timers=vi.getTimerCount();command(1,"play");await vi.advanceTimersByTimeAsync(0);expect(vi.getTimerCount()).toBe(timers+1);command(2,"pause");await vi.advanceTimersByTimeAsync(0);expect(vi.getTimerCount()).toBe(timers);video.dispatchEvent(new Event("loadeddata"));await Promise.resolve();await Promise.resolve();expect(video.play).not.toHaveBeenCalled();command(3,"play");window.dispatchEvent(new Event("pagehide"));await vi.advanceTimersByTimeAsync(0);expect(vi.getTimerCount()).toBe(timers);}finally{window.dispatchEvent(new Event("pagehide"));vi.useRealTimers();}
});

it("浏览器拒绝预览声音时给可操作中文提示，不展示底层异常链接",async()=>{document.body.innerHTML='<video id="th" class="clip talking-head" data-start="0" data-duration="1"></video>';const video=document.querySelector("video")!;Object.defineProperty(video,"readyState",{value:4});video.play=vi.fn(async()=>{throw new DOMException("play() failed because the user did not interact https://browser-policy","NotAllowedError");});video.pause=vi.fn();Object.defineProperty(document,"fonts",{value:{ready:Promise.resolve()},configurable:true});const messages=vi.spyOn(window.parent,"postMessage");const html=withPreviewBridge('<body></body></html>',"blocked",1);window.eval(html.slice(html.indexOf('<script>')+8,html.indexOf('</script>')));await Promise.resolve();await Promise.resolve();window.dispatchEvent(new MessageEvent("message",{source:window.parent,data:{channelId:"blocked",commandId:1,type:"play"}}));await vi.waitFor(()=>expect(messages).toHaveBeenCalledWith(expect.objectContaining({type:"state",state:"blocked",message:"浏览器尚未允许预览声音，请点击画面中的播放按钮"}),"*"));});

it("跨片段定位后的canplay恢复连续播放，不要求已发生过的loadeddata再发一次",async()=>{
 document.body.innerHTML='<video id="th" class="clip talking-head" data-start="0" data-duration="1" data-media-start="5"></video><video id="th-1" class="clip talking-head" data-start="1" data-duration="1" data-media-start="9"></video>';
 const videos=[...document.querySelectorAll("video")],calls=videos.map(()=>vi.fn(async()=>{}));let state=4,offset=0;
 videos.forEach((video,index)=>{Object.defineProperty(video,"readyState",{get:()=>index===0?4:state});Object.defineProperty(video,"paused",{value:true,configurable:true});video.play=calls[index]!;video.pause=vi.fn();});Object.defineProperty(videos[1]!,'currentTime',{get:()=>offset,set:value=>{offset=value;state=1;}});
 Object.defineProperty(document,"fonts",{value:{ready:Promise.resolve()},configurable:true});(window as unknown as {__timelines:unknown}).__timelines={main:{pause:vi.fn(),seek:vi.fn()}};
 let raf:FrameRequestCallback|undefined;vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>{raf=callback;return 1;});vi.stubGlobal("cancelAnimationFrame",vi.fn());const messages=vi.spyOn(window.parent,"postMessage");const html=withPreviewBridge('<body></body></html>',"seam",2);window.eval(html.slice(html.indexOf('<script>')+8,html.indexOf('</script>')));await Promise.resolve();await Promise.resolve();
 window.dispatchEvent(new MessageEvent("message",{source:window.parent,data:{channelId:"seam",commandId:1,type:"play"}}));await Promise.resolve();await Promise.resolve();videos[0]!.currentTime=6;raf?.(0);await Promise.resolve();await Promise.resolve();expect(offset).toBe(9);expect(calls[1]).not.toHaveBeenCalled();state=4;videos[1]!.dispatchEvent(new Event("canplay"));await vi.waitFor(()=>expect(calls[1]).toHaveBeenCalledOnce());expect(messages).not.toHaveBeenCalledWith(expect.objectContaining({message:"素材准备失败，请重试预览"}),"*");
});

it("旧播放确认迟到不得暂停同视频上已生效的新播放命令",async()=>{
 document.body.innerHTML='<video id="th" class="clip talking-head" data-start="0" data-duration="1"></video>';const video=document.querySelector("video")!;Object.defineProperty(video,"readyState",{value:4});Object.defineProperty(video,"paused",{value:false,configurable:true});let finishOld!:()=>void;video.play=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{finishOld=resolve;})).mockResolvedValue(undefined);video.pause=vi.fn();const messages=vi.spyOn(window.parent,"postMessage");Object.defineProperty(document,"fonts",{value:{ready:Promise.resolve()},configurable:true});(window as unknown as {__timelines:unknown}).__timelines={main:{pause:vi.fn(),seek:vi.fn()}};vi.stubGlobal("requestAnimationFrame",vi.fn(()=>1));vi.stubGlobal("cancelAnimationFrame",vi.fn());const html=withPreviewBridge('<body></body></html>',"late-play",1);window.eval(html.slice(html.indexOf('<script>')+8,html.indexOf('</script>')));const command=(commandId:number,type:string)=>window.dispatchEvent(new MessageEvent("message",{source:window.parent,data:{channelId:"late-play",commandId,type}}));const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};await settle();
 command(1,"play");await settle();command(2,"pause");command(3,"play");await settle();expect(video.play).toHaveBeenCalledTimes(2);expect(messages).toHaveBeenCalledWith(expect.objectContaining({commandId:3,type:"state",state:"playing"}),"*");const pauses=vi.mocked(video.pause).mock.calls.length;finishOld();await settle();expect(video.pause).toHaveBeenCalledTimes(pauses);
});
