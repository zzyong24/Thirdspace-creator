'use client';
import * as React from 'react';
export function LazyDisclosure({label,children}:{label:string;children:()=>React.ReactNode}){const [open,setOpen]=React.useState(false);return <details className="rounded-xl border border-border p-4" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer font-medium">{label}</summary>{open&&<div className="mt-4 space-y-4">{children()}</div>}</details>;}
