import * as React from 'react';
export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{},back:()=>{}});
export const useSearchParams=()=>new URLSearchParams('copilot=open&selKind=project&selId=witness');
export const usePathname=()=>'/witness';
export default function Link({children,...props}:React.PropsWithChildren<Record<string,unknown>>){return <a {...props}>{children}</a>;}
