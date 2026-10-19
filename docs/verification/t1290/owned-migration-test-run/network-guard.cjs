'use strict';
const net=require('node:net'),tls=require('node:tls'),http=require('node:http'),https=require('node:https');
const allowed=new URL(process.env.CREATOROS_TEST_POSTGRES_URL);if(allowed.hostname!=='127.0.0.1'||!allowed.port)throw Error('NO_OWNED_PG_NETWORK_BINDING');
const original=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args){let value=args[0];if(Array.isArray(value))value=value[0];let port,host;if(typeof value==='object'&&value!==null){port=value.port;host=value.host??value.hostname??'localhost';if(value.path)throw Error('FORBIDDEN_UNIX_SOCKET');}else{port=value;host=typeof args[1]==='string'?args[1]:'localhost';}
 if(Number(port)!==Number(allowed.port)||!['127.0.0.1','localhost'].includes(host))throw Error('FORBIDDEN_NON_OWNED_NETWORK');return Reflect.apply(original,this,args);};
const forbidden=()=>{throw Error('FORBIDDEN_MODEL_HTTP_TLS_OR_LISTEN');};
tls.connect=forbidden;http.request=http.get=https.request=https.get=forbidden;net.Server.prototype.listen=forbidden;globalThis.fetch=forbidden;
