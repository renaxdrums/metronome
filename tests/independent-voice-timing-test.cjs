const fs=require('node:fs');const assert=require('node:assert/strict');const path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'metronome-core.js'),'utf8'),guide=fs.readFileSync(path.join(root,'amorce-song.js'),'utf8');
const anchors=JSON.parse(fs.readFileSync(path.join(__dirname,'voice-anchors.json'),'utf8'));
const table=Function('return ('+html.match(/const VOICE_ATTACK_SECONDS = (\{[\s\S]*?\});/)[1]+')')();
for(const anchor of anchors)assert.equal(table[anchor.gender][anchor.number],anchor.anchor_ms/1000);
const from=html.indexOf('function playVoiceMetronome('),to=html.indexOf('    const SOUND_BANKS',from),renderer=html.slice(from,to),calls=[];
const execute=Function('VOICE_ATTACK_SECONDS','calls',`
const VOICE_METRONOME_BUFFERS={male:Object.fromEntries(Array.from({length:21},(_,n)=>[n,{duration:1,sampleRate:24000,length:24000,numberOfChannels:1,getChannelData(){return new Float32Array(24000).fill(.045)}}]))};
const scheduledVoiceSources=new Set(),playVoiceSubdivisionTick=()=>{};
const audioCtx={currentTime:0,createBufferSource(){return{playbackRate:{setValueAtTime(){}},connect(){},start(t,o){calls.push({t,o})}}},createGain(){return{gain:{setValueAtTime(){}},connect(){}}}};
${renderer}
for(let n=1;n<=20;n++)playVoiceMetronome('male',{},10,1,false,{beatNumber:n,voiceAnchorSeconds:9});
renderVoiceCount('male',{},10,1,false,{beatNumber:2,subIndex:0},{anchors:[0,0,.4],volumes:[0,.5,.6,.7],firstGain:1,playbackRate:1});
playVoiceMetronome('male',{},10,1,false,{beatNumber:2,subIndex:0});
`);
execute(table,calls);
for(let n=1;n<=20;n++)assert.ok(Math.abs(calls[n-1].t+table.male[n]-10)<1e-9);
assert.equal(calls[20].t,9.6);assert.equal(calls[21].t,9.825);
assert.ok(!guide.includes("currentBank='voiceMale'"));assert.ok(guide.includes("renderVoiceCount('male'"));
console.log('PASS: 40 validated anchors; 20 scheduled male words; independent song cue timing.');
