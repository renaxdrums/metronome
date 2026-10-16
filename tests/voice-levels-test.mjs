import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {synthesize} from '../prototypes/amorce/engine.mjs';
import {phonemeInput,neuralAudio} from '../prototypes/amorce/neural-core.mjs';
import {joinNumber} from '../prototypes/amorce/separate-number.mjs';
import {lastSyllableCandidate} from '../prototypes/amorce/syllables.mjs';
const runtime=await import(process.env.TRANSFORMERS_MODULE),root=process.env.NEURAL_ASSETS;runtime.env.allowRemoteModels=false;
const model=await runtime.StyleTextToSpeech2Model.from_pretrained(root,{dtype:'q8',device:'cpu'}),tokenizer=await runtime.AutoTokenizer.from_pretrained(root);
const results=[];
async function make(text,language){const voice=language==='fr'?'ff_siwis':'bm_george',bytes=await readFile(root+'/voices/'+voice+'.bin'),data=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));const reference=await synthesize(text,language);return {...await neuralAudio(runtime,model,tokenizer,data,phonemeInput(reference.events)),voice};}
for(const [text,language] of [['Solo','fr'],['Introduction','fr'],['Chorus','en'],['My custom drum breakdown','en'],['Couplet 1','fr'],['Refrain 1','fr']]){
 const numbered=text.match(/^(.*) 1$/u);
 const audio=numbered?joinNumber(await make(numbered[1],'fr'),await make('1','fr')):await make(text,language);
 const file=new URL('renax-voice-level.f32',new URL('file:///'+process.env.TEST_OUTPUT_DIR.replaceAll('\\','/')+'/')).pathname.replace(/^\/(\w:)/,'$1');await writeFile(file,Buffer.from(audio.pcm.buffer));
 const stderr=spawnSync('ffmpeg',['-hide_banner','-f','f32le','-ar','24000','-ac','1','-i',file,'-af','ebur128','-f','null','-'],{encoding:'utf8'}).stderr;
 const matches=[...stderr.matchAll(/I:\s*(-?[\d.]+) LUFS/g)];assert(matches.length,'FFmpeg must report integrated loudness: '+stderr);const lufs=Number(matches.at(-1)[1]);
 assert(Math.abs(lufs+20)<=.2);assert(audio.level.peakAfter<=.80001);
 const anchor=lastSyllableCandidate(audio.events,language);
 if(numbered){assert(audio.separateNumber);assert(!audio.events.some(e=>e.id==='z'));assert.equal(anchor.nucleusPhone,'ˈœ̃');}
 results.push({text,language,voice:audio.voice,lufs,level:audio.level,anchor,separateNumber:!!audio.separateNumber});console.log(text,lufs);
}
await writeFile(new URL('./voice-levels-results.json',import.meta.url),JSON.stringify(results,null,2)+'\n');await model.dispose();
