import '../../network-origins.js';
import {neuralAudio} from './neural-core.mjs?v=20261009-levels';
const modelId='onnx-community/Kokoro-82M-v1.0-ONNX-timestamped',revision='dd4401a9add81ac692d20e240d22ec9dda82cc29';
let initialized,model,tokenizer,runtime,backend='wasm',fallbackReason='';const voices=new Map();
async function initialize(requested){
 self.postMessage({progress:'Chargement du moteur neuronal…'});
 runtime=await import(globalThis.RENAX_NETWORK.transformers+'dist/transformers.min.js');
 runtime.env.allowLocalModels=false;runtime.env.backends.onnx.wasm.numThreads=1;
 self.postMessage({progress:'Chargement du modèle Kokoro…'});
 tokenizer=await runtime.AutoTokenizer.from_pretrained(modelId,{revision});
 if(requested==='webgpu'){
  try{
   if(!self.navigator.gpu||!await self.navigator.gpu.requestAdapter())throw new Error('WebGPU indisponible');
   model=await runtime.StyleTextToSpeech2Model.from_pretrained(modelId,{revision,dtype:'q8',device:'webgpu'});
   backend='webgpu';
  }catch(error){fallbackReason=error.message;self.postMessage({progress:'WebGPU indisponible pour ce modèle ; reprise sur CPU…'});}
 }
 if(!model)model=await runtime.StyleTextToSpeech2Model.from_pretrained(modelId,{revision,dtype:'q8',device:'wasm'});
 self.postMessage({progress:'Modèle chargé. Préparation de la voix…'});
}
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{
 const {id,input,language,device}=data;
 try{
  if(!initialized)initialized=initialize('wasm').catch(e=>{initialized=null;throw e;});
  await initialized;
  const voice='bm_george';
  if(!voices.has(voice)){
   const response=await fetch(`https://huggingface.co/${modelId}/resolve/${revision}/voices/${voice}.bin`);
   if(!response.ok)throw new Error('NEURAL_VOICE_DOWNLOAD_FAILED');
   voices.set(voice,new Float32Array(await response.arrayBuffer()));
  }
  self.postMessage({progress:'Synthèse de la voix naturelle…'});
   const started=performance.now();let r;
  try{r=await neuralAudio(runtime,model,tokenizer,voices.get(voice),input);}
  catch(error){
   if(backend!=='webgpu')throw error;
   fallbackReason=error.message;await model.dispose();backend='wasm';
   model=await runtime.StyleTextToSpeech2Model.from_pretrained(modelId,{revision,dtype:'q8',device:'wasm'});
   r=await neuralAudio(runtime,model,tokenizer,voices.get(voice),input);
  }
  r={...r,backend,fallbackReason,inferenceMs:performance.now()-started};
  self.postMessage({id,result:{...r,voice}},[r.pcm.buffer]);
 }catch(e){self.postMessage({id,error:e.message});}
});};
