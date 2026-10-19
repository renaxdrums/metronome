import '../../network-origins.js';
import {withDurations} from './piper-model.mjs';
import {normalizeVoice} from './voice-loudness.mjs?v=20261009-levels';
const runtimeURL=globalThis.RENAX_NETWORK.onnx+'dist/';
const modelURL='https://huggingface.co/rhasspy/piper-voices/resolve/c10ece1aade47bb51c153c893d14e5bf8e5b7117/fr/fr_FR/siwis/medium/fr_FR-siwis-medium.onnx';
let ready,ort,session,config;
async function initialize(){
 self.postMessage({progress:'Chargement de la voix française Piper…'});
 const [runtime,response,configuration]=await Promise.all([import(runtimeURL+'ort.min.mjs'),fetch(modelURL),fetch(new URL('./piper-config.json',import.meta.url))]);
 if(!response.ok||!configuration.ok)throw new Error('PIPER_DOWNLOAD_FAILED');
 ort=runtime;config=await configuration.json();ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=runtimeURL;
 session=await ort.InferenceSession.create(withDurations(await response.arrayBuffer()),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
}
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(async()=>{
 const {id,input}=data;try{
  if(!ready)ready=initialize().catch(error=>{ready=null;throw error;});await ready;
  const started=performance.now(),ids=[...config.phoneme_id_map['^'],...config.phoneme_id_map['_']],positions=[];
  for(const character of Array.from(input.text)){const mapped=config.phoneme_id_map[character];if(!mapped)throw new Error('UNSUPPORTED_PIPER_PHONEME');positions.push(ids.length);ids.push(...mapped,...config.phoneme_id_map['_']);}
  ids.push(...config.phoneme_id_map['$']);
  if(ids.length>2048)throw new Error('LABEL_TOO_LONG_FOR_PIPER');
  const scales=config.inference;
  const output=await session.run({input:new ort.Tensor('int64',BigInt64Array.from(ids,BigInt),[1,ids.length]),input_lengths:new ort.Tensor('int64',BigInt64Array.from([ids.length],BigInt),[1]),scales:new ort.Tensor('float32',new Float32Array([scales.noise_scale,scales.length_scale,scales.noise_w]),[3])});
  const pcm=new Float32Array(output.output.data),durations=output['/Ceil_output_0'].data,starts=[0],sampleRate=config.audio.sample_rate;
  if(durations.length!==ids.length||!pcm.length)throw new Error('INVALID_PIPER_OUTPUT');
  for(const frames of durations){if(!Number.isFinite(frames)||frames<0)throw new Error('INVALID_PIPER_DURATION');starts.push(starts.at(-1)+frames*256/sampleRate);}
  if(Math.abs(starts.at(-1)*sampleRate-pcm.length)>1)throw new Error('PIPER_DURATION_LENGTH_MISMATCH');
  const events=input.source.map((event,i)=>({...event,audio_position:starts[positions[input.offsets[i]]]*1000,timingSource:'piper-predicted-duration'}));
  if(pcm.some(x=>!Number.isFinite(x)))throw new Error('INVALID_PIPER_AUDIO');
  const level=normalizeVoice(pcm,sampleRate);
  self.postMessage({id,result:{pcm,sampleRate,events,level,anchorVerified:false,model:'Piper SIWIS medium',voice:'fr_FR-siwis-medium',backend:'wasm',timingSource:'model-predicted-phoneme-durations',inferenceMs:performance.now()-started}},[pcm.buffer]);
 }catch(error){self.postMessage({id,error:error.message});}
 });};
