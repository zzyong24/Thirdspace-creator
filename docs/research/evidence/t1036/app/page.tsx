'use client';
import dynamic from 'next/dynamic';
const Probe = dynamic(()=>import('./probe'),{ssr:false});
export default function Page(){return <Probe/>}
