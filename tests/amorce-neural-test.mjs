import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {synthesize} from '../prototypes/amorce/engine.mjs';
import {phonemeInput,neuralAudio} from '../prototypes/amorce/neural-core.mjs';
import {lastSyllableCandidate} from '../prototypes/amorce/syllables.mjs';
const runtime=await import(process.env.TRANSFORMERS_MODULE);
runtime.env.allowRemoteModels=false;
const root=process.env.NEURAL_ASSETS;
const [model,tokenizer]=await Promise.all([runtime.StyleTextToSpeech2Model.from_pretrained(root,{dtype:'q8',device:'cpu'}),runtime.AutoTokenizer.from_pretrained(root)]);
const results=[];
for(const [text,language] of [['Introduction','fr'],['Couplet personnalisé','fr'],['Refrain final','fr'],['Introduction','en'],['Chorus','en'],['My custom drum breakdown','en']]){
 const reference=await synthesize(text,language),input=phonemeInput(reference.events);
 const bytes=await readFile(root+'/voices/'+'bm_george'+'.bin');
 const data=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const started=Date.now(),audio=await neuralAudio(runtime,model,tokenizer,data,input),candidate=lastSyllableCandidate(audio.events,language);
 let peak=0;for(const v of audio.pcm)peak=Math.max(peak,Math.abs(v));
 assert(audio.pcm.length>2400&&candidate.anchorSeconds<audio.pcm.length/24000);
 assert.equal(audio.anchorVerified,false);assert(peak<=.801);
 assert.equal(audio.level.targetLufs,-20);
 assert(audio.level.peakLimited?audio.level.loudnessAfter<=-20:Math.abs(audio.level.loudnessAfter+20)<.001);
 results.push({text,language,phones:input.text,duration:audio.pcm.length/24000,inferenceMs:Date.now()-started,peak,level:audio.level,voice:'bm_george',candidate,timingSource:audio.timingSource});
 console.log(results.at(-1));
}
await writeFile(new URL('../prototypes/amorce/neural-results.json',import.meta.url),JSON.stringify({model:'Kokoro-82M',revision:'dd4401a9add81ac692d20e240d22ec9dda82cc29',results,anchorVerified:false},null,2)+'\n');
await model.dispose();
