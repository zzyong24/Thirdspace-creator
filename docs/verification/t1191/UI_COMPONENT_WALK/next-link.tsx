import * as React from 'react';
import {evidence,notify} from './state';
export default function Link({href,children,...rest}:any){return <a {...rest} href={typeof href==='string'?href:'#'} onClick={event=>{event.preventDefault();evidence.navigation.push({method:'link',href});notify();}}>{children}</a>;}
