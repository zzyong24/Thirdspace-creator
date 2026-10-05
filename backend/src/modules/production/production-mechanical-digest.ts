import {createHash} from 'node:crypto';
export const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>`${JSON.stringify(k)}:${canonical(x)}`).join(',')}}`:JSON.stringify(v)??'null';
export const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
export const byteHash=(v:Uint8Array)=>createHash('sha256').update(v).digest('hex');
