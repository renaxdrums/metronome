const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto'),path=require('node:path');
const {start,save}=require('./audio-harness.cjs');
const root=path.resolve(__dirname,'..');
const previous=cp.execFileSync('git',['-C',root,'show','f38d9b3f76acd05a608151c663ba2706d6fb4431:pro-sound-bank.js'],{encoding:'utf8',maxBuffer:8e6});
(async()=>{const h=await start(),errors=[];try{
 const renders=[];
 for(const baseline of [true,false]){
  const p=await h.browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{window._atobCalls=0;const decode=atob;window.atob=(...a)=>{_atobCalls++;return decode(...a)}});
  if(baseline)await p.route('**/pro-sound-bank.js*',r=>r.fulfill({contentType:'text/javascript',body:previous}));
  await p.goto(h.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady&&window.RENAX_PRO_SOUNDS);
  const result=await p.evaluate(async()=>{
   const startupDecodes=_atobCalls,rows=[];
   for(const key of RENAX_PRO_SOUNDS.keys){
    const bank=SOUND_BANKS[key],context=new OfflineAudioContext(1,Math.ceil((2.5+bank.tail/.8)*48000),48000);audioCtx=context;
    bank.prepare?.(context);const before=_atobCalls;
    for(const [i,state,first,musical]of [[0,1,false,{}],[1,2,false,{isMainBeat:true}],[2,3,true,{}],[3,1,false,{isOtherStrongBeat:true}],[4,2,false,{}]])bank.play(context.destination,.15+i*.45,state,first,musical);
    const schedulerDecodes=_atobCalls-before,pcm=(await context.startRendering()).getChannelData(0);let peak=0;for(const x of pcm)peak=Math.max(peak,Math.abs(x));
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',pcm.buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');const attack=pcm.slice(7200,11040);const attackHash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',attack.buffer))].map(x=>x.toString(16).padStart(2,'0')).join('');rows.push({key,hash,attackHash,peak,tail:bank.tail,schedulerDecodes});
   }
   return {startupDecodes,rows};
  });
  renders.push(result);await p.close();
 }
 assert.equal(renders[1].startupDecodes,0);
 for(let i=0;i<renders[0].rows.length;i++){const before=renders[0].rows[i],after=renders[1].rows[i];assert.equal(after.key,before.key);if(after.key==='proCowbell'){assert.equal(after.attackHash,before.attackHash,'Cowbell attack changed');assert(after.tail>1.3,'Cowbell resonance still cropped');}else{assert.equal(after.hash,before.hash,after.key+' PCM changed');assert.equal(after.tail,before.tail,after.key+' tail changed');}assert.equal(after.schedulerDecodes,0,after.key+' decoded in play');}
 const p=await h.browser.newPage(),requests=[];p.on('request',r=>{if(/\/beep-[123]\.wav/.test(r.url()))requests.push(r.url())});await p.goto(h.url);await p.evaluate(()=>prepareAllVoiceAudio());await p.waitForFunction(()=>allVoiceAudioReady);
 const isolated=await p.evaluate(async()=>{await initAudio();const foreign=audioCtx,target=new OfflineAudioContext(1,48000,48000),bank=SOUND_BANKS.userMetroclic;bank.prepare(target);bank.play(target.destination,.1,2,false);const pcm=(await target.startRendering()).getChannelData(0),buffer=await ensureInstrumentBankReady('beep');return {nonzero:pcm.some(x=>x!==0),globalUnchanged:audioCtx===foreign,shakerPrepared:!!buffer?.getChannelData,shakerAlias:SOUND_BANKS.beep===SOUND_BANKS.proShaker}});
 assert.deepEqual(isolated,{nonzero:true,globalUnchanged:true,shakerPrepared:true,shakerAlias:true});assert.deepEqual(requests,[]);await p.close();
 const current=fs.readFileSync(path.join(root,'pro-sound-bank.js'),'utf8');const source=current.match(/const samples=(\[[\s\S]*?\]);/)[1],samples=JSON.parse(source),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/metronome/pro-samples-manifest.json'),'utf8'));
 for(const row of manifest.samples){const sample=samples.find(x=>x.key===row.key);assert.equal(crypto.createHash('sha256').update(Buffer.from(sample.pcm,'base64')).digest('hex'),row.pcmSha256);assert.equal(row.rate,sample.rate);}
 assert.deepEqual(errors,[]);save('pro-sound-context-results.json',{baseline:'f38d9b3',renders,isolated,unusedBeepRequests:requests,provenanceSamples:manifest.samples.length,errors});
 console.log('PASS',renders[1].rows.length,'sample banks (only cowbell decay extended), no startup/scheduler decoding, explicit output context and no unused Beep downloads');
}finally{await h.browser.close();h.server?.close()}})().catch(e=>{console.error(e);process.exitCode=1});
