import {createServer} from 'node:net';
const server=createServer();
const timeout=setTimeout(()=>{console.error('owned loopback admission probe timeout after 120000ms');server.close();process.exitCode=1;},120000);
server.once('error',error=>{clearTimeout(timeout);console.error(JSON.stringify({code:error.code,message:error.message}));process.exitCode=1;});
server.listen(0,'127.0.0.1',()=>{clearTimeout(timeout);console.log(JSON.stringify({listening:true,address:server.address()}));server.close();});
