const intent = new URLSearchParams(location.search).get('intent') === 'link_owner' ? 'link_owner' : 'register_device';
const idle = { state:'idle', intent:null, userCode:null, verificationUrl:null, expiresAt:null, retryAfterSeconds:null, message:'可以连接本人产品' };
let state = sessionStorage.getItem('owned-state') || 'idle';
(window as any).__calls=[];
export async function invoke(command:string,args:any) {
  (window as any).__calls.push({command,args});
  if(command==='owned_device_start'){state='waiting'; sessionStorage.setItem('owned-state',state);}
  if(command==='owned_device_cancel'){state='idle';sessionStorage.setItem('owned-state',state);}
  if(command==='owned_device_poll' && (window as any).__fail){throw '授权服务暂不可用，请保留这次连接并稍后重试';}
  if(command==='owned_device_poll' && (window as any).__confirmed){state=intent==='link_owner'?'linked':'activated';sessionStorage.setItem('owned-state',state);}
  return state==='waiting'?{state,intent,userCode:'ABCD-EFGH',verificationUrl:'https://growth.aitongban.cloud/products/connect#code=ABCD-EFGH',expiresAt:'2026-10-09T06:00:00.000Z',retryAfterSeconds:120,message:'等待官方页面确认'}:{...idle,state,message:state==='activated'?'本机已启用':state==='linked'?'产品已连接本人账号':idle.message};
}
export async function openUrl(url:string){(window as any).__opened=url;}
export async function relaunch(){throw new Error('诊断环境不重启软件');}
