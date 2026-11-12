/** Backpressured Worker protocol. One chunk can be in flight at a time. */
import {renderWarpPCMChunks} from './warp-stream.mjs';

let current=null;
function error(id,reason){self.postMessage({id,type:'error',code:reason.code||'DSP_FAILED',message:reason.message||'Streaming Warp failed'});}
self.addEventListener('message',event=>{
  const {id,type,config}=event.data||{};
  if(type==='ack' && current?.id===id){const release=current.release;current.release=null;release?.();return;}
  if(type==='cancel' && current?.id===id){current.cancelled=true;const release=current.release;current.release=null;release?.();return;}
  if(type!=='render-chunks')return;
  if(current){error(id,{code:'BUSY',message:'Warp Worker already rendering'});return;}
  const job={id,cancelled:false,release:null};
  current=job;
  (async()=>{
    try{
      const generator=renderWarpPCMChunks({...config,signal:{get aborted(){return job.cancelled;}},
        onProgress:progress=>self.postMessage({id,type:'progress',progress})});
      let answer;
      for(;;){
        if(job.cancelled)break;
        answer=generator.next();
        if(answer.done)break;
        const {frameOffset,channels}=answer.value;
        // The transferred chunk has no further references inside the generator.
        self.postMessage({id,type:'chunk',frameOffset,channels},channels.map(x=>x.buffer));
        await new Promise(resolve=>{job.release=resolve;});
        job.release=null;
      }
      if(job.cancelled){error(id,{code:'CANCELLED',message:'Warp rendering cancelled'});return;}
      self.postMessage({id,type:'done',metrics:answer.value});
    }catch(cause){error(id,cause);}finally{if(current===job)current=null;}
  })();
});
