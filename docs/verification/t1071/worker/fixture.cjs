let execution, count=0;
const next=()=>process.send({version:1,type:'call',requestId:`audio-${count+1}`,execution,port:'readTranscribeAudio',data:{awemeId:`synthetic-${count+1}`}});
process.on('message',message=>{
 if(message.type==='run'){execution=message.execution;next();}
 if(message.type==='reply'){
  count++;
  if(count%25===0)process.send({version:1,type:'progress',requestId:'progress',execution,seq:count,text:String(count)});
  if(count<100)setTimeout(next,count%25===0?1000:0);
 }
 if(message.type==='cancel')process.send({version:1,type:'stopped',requestId:message.requestId,execution,reason:'cancelled'});
});
process.send({version:1,type:'ready',requestId:'ready',capabilities:['transcribe.douyin']});
