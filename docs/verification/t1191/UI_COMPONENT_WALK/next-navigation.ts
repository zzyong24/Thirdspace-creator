import {evidence,notify} from './state';
const navigation=(method:string,url?:string)=>{evidence.navigation.push({method,url});notify();};
export const usePathname=()=>'/';
export const useSearchParams=()=>new URLSearchParams('copilot=open');
export const useRouter=()=>({push:(url:string)=>navigation('push',url),replace:(url:string)=>navigation('replace',url),back:()=>navigation('back'),refresh:()=>navigation('refresh')});
