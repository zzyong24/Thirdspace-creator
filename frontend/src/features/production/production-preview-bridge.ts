/** 固定模板桥接。输入只含会话ID与时长，不执行消息中的代码。 */
function runPreviewBridge(channelId:string,duration:number) {
  let commandId=0,frame=0,playing=false,position=0,generation=0,disposed=false;
  const main=document.querySelector<HTMLVideoElement>("#th");
  const heads=[...document.querySelectorAll<HTMLVideoElement>(".talking-head")];
  if(!heads.length&&main)heads.push(main);
  let activeMain:HTMLVideoElement|undefined=heads[0];
  const clips=[...document.querySelectorAll<HTMLElement>(".clip[data-start][data-duration]")];
  const videos=[...document.querySelectorAll<HTMLMediaElement>("video,audio")];
  const timeline=(window as unknown as {__timelines?:{main?:{pause():void;seek(t:number,suppressEvents?:boolean):void}}}).__timelines?.main;
  const emit=(type:string,extra:Record<string,unknown>={})=>{if(!disposed)parent.postMessage({channelId,commandId,type,...extra},"*");};
  const startOf=(m:HTMLMediaElement)=>Number(m.dataset.start??0),endOf=(m:HTMLMediaElement)=>startOf(m)+Number(m.dataset.duration??duration);
  const offsetOf=(m:HTMLMediaElement)=>Number(m.dataset.mediaStart??0);
  const headAt=(time:number)=>heads.find(h=>time>=startOf(h)&&time<endOf(h))??(time===duration?heads.at(-1):undefined);
  const pendingMedia=new Set<()=>void>();
  const playOwners=new WeakMap<HTMLMediaElement,number>();
  const stop=()=>{playbackPermissionButton?.remove();playbackPermissionButton=null;generation++;for(const cancel of [...pendingMedia])cancel();cancelAnimationFrame(frame);frame=0;playing=false;for(const m of videos)m.pause();};
  const draw=(time:number)=>{
    position=Math.max(0,Math.min(duration,time));timeline?.pause();timeline?.seek(position,false);
    for(const clip of clips){const start=Number(clip.dataset.start),end=start+Number(clip.dataset.duration);clip.style.visibility=position>=start&&position<end?"visible":"hidden";}
    activeMain=headAt(position);
    for(const m of videos){
      const active=position>=startOf(m)&&position<endOf(m),local=Math.max(0,position-startOf(m)+offsetOf(m));
      if(active){if(Math.abs(m.currentTime-local)>.001 && (m!==activeMain||!playing))m.currentTime=local;m.volume=Math.max(0,Math.min(1,Number(m.dataset.volume??1)));
        if(m!==activeMain&&playing&&m.readyState>=2&&m.paused){const own=generation;playOwners.set(m,own);void m.play().then(()=>{if(disposed||((own!==generation||!playing)&&playOwners.get(m)===own))m.pause();}).catch(()=>{if(own===generation){stop();showPlaybackPermission();emit("state",{state:"blocked",message:"浏览器尚未允许预览声音，请点击画面中的播放按钮"});}});}
      }else m.pause();
    }
    emit("time",{time:position});
  };
  const readyMedia=(media:HTMLMediaElement,own:number)=>media.readyState>=2?Promise.resolve():new Promise<void>((resolve,reject)=>{
    const clear=()=>{pendingMedia.delete(cancel);media.removeEventListener("loadeddata",loaded);media.removeEventListener("canplay",loaded);media.removeEventListener("seeked",loaded);media.removeEventListener("error",failed);clearTimeout(timer);};
    const loaded=()=>{if(media.readyState<2)return;clear();if(disposed||generation!==own)reject(Error("预览命令已更新"));else resolve();};
    const failed=()=>{clear();reject(Error("素材准备失败，请重试预览"));};
    const cancel=()=>{clear();reject(Error("预览命令已更新"));};pendingMedia.add(cancel);
    const timer=setTimeout(failed,15000);media.addEventListener("loadeddata",loaded);media.addEventListener("canplay",loaded);media.addEventListener("seeked",loaded);media.addEventListener("error",failed,{once:true});
    // 已载入的视频 seek 只会再发 seeked/canplay；同时复核监听安装前后的就绪竞态。
    if(media.readyState>=2)loaded();
  });
  let playbackPermissionButton:HTMLButtonElement|null=null;
  const showPlaybackPermission=()=>{
    if(playbackPermissionButton)return;
    const button=document.createElement("button");button.type="button";button.textContent="点击启用预览声音并播放";button.setAttribute("aria-label","点击启用预览声音并播放");button.style.cssText="position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2147483647;padding:20px 30px;border:2px solid white;border-radius:12px;background:#18181b;color:white;font:600 32px sans-serif;cursor:pointer";
    button.addEventListener("click",()=>{button.remove();playbackPermissionButton=null;stop();void playAt(position,generation);});playbackPermissionButton=button;document.body.append(button);
  };
  const playAt=async(time:number,own:number)=>{
    draw(time);const media=activeMain;
    if(!media){stop();emit("state",{state:"paused"});return;}
    try{
      if(media.readyState<2){emit("state",{state:"paused",message:"正在准备该片段，草稿已保留"});await readyMedia(media,own);}if(disposed||own!==generation)return;
      const targetTime=Math.max(offsetOf(media),time-startOf(media)+offsetOf(media));if(media.currentTime!==targetTime)media.currentTime=targetTime;
      playOwners.set(media,own);await media.play();if(disposed||own!==generation){if(disposed||playOwners.get(media)===own)media.pause();return;}
      playing=true;emit("state",{state:"playing"});tick();
    }catch(error){if(!disposed&&own===generation){stop();emit("state",{state:"blocked",message:error!==null&&typeof error==="object"&&"name" in error&&error.name==="NotAllowedError"?(showPlaybackPermission(),"浏览器尚未允许预览声音，请点击画面中的播放按钮"):error instanceof Error?error.message:"浏览器未允许播放，请再点击播放"});}}
  };
  const tick=()=>{
    if(!playing||!activeMain||disposed)return;
    const media=activeMain,time=Math.max(startOf(media),Math.min(endOf(media),startOf(media)+media.currentTime-offsetOf(media)));
    if(time>=endOf(media)-1e-6||media.ended){
      media.pause();playing=false;position=endOf(media);
      if(position>=duration-1e-6){draw(duration);stop();emit("state",{state:"paused"});return;}
      void playAt(position,generation);return;
    }
    draw(time);frame=requestAnimationFrame(tick);
  };
  const receive=(event:MessageEvent)=>{
    if(event.source!==parent || !event.data || event.data.channelId!==channelId)return;
    const data=event.data;if(!Number.isSafeInteger(data.commandId)||data.commandId<=commandId || !["seek","play","pause"].includes(data.type))return;
    if(data.type==="seek" && (!Number.isFinite(data.time)||data.time<0||data.time>duration))return;
    commandId=data.commandId;stop();
    if(data.type==="seek"){draw(data.time);emit("state",{state:"paused"});}
    else if(data.type==="play"){void playAt(position>=duration?0:position,generation);}
    else emit("state",{state:"paused"});
  };
  window.addEventListener("message",receive);
  window.addEventListener("pagehide",()=>{stop();disposed=true;window.removeEventListener("message",receive);},{once:true});
  for(const m of videos)m.addEventListener("error",()=>{stop();emit("state",{state:"error",message:"素材预览读取失败，请刷新预览"});});
  const ready=async()=>{await document.fonts.ready;if(disposed)return;if(!timeline || !main){emit("state",{state:"error",message:"预览模板未就绪，请重试"});return;}draw(0);emit("ready");};
  if(main&&main.readyState<2)main.addEventListener("loadeddata",()=>void ready(),{once:true});else void ready();
}

export function withPreviewBridge(html:string,channelId:string,duration:number):string {
  const args=JSON.stringify([channelId,duration]).replaceAll("<","\\u003c");
  // 只添加固定桥接到后端固定模板结尾，绝不替换用户字段或URL。
  const closing="</body></html>";if(!html.endsWith(closing))throw new Error("预览模板不完整");
  return html.slice(0,-closing.length)+`<script>(${runPreviewBridge.toString()})(...${args});</script>`+closing;
}
export function validPreviewMessage(event:{source:unknown;data:unknown},source:unknown,channelId:string,minCommandId:number,duration:number):event is {source:unknown;data:{channelId:string;commandId:number;type:"ready"|"time"|"state";time?:number;state?:string;message?:string}} {
  if(event.source!==source || !event.data || typeof event.data!=="object")return false;
  const d=event.data as Record<string,unknown>;if(d.channelId!==channelId || !Number.isSafeInteger(d.commandId) || (d.commandId as number)<minCommandId)return false;
  if(d.type==="ready")return d.commandId===0;
  if(d.type==="time")return typeof d.time==="number"&&Number.isFinite(d.time)&&d.time>=0&&d.time<=duration;
  return d.type==="state"&&["playing","paused","blocked","error"].includes(String(d.state));
}
