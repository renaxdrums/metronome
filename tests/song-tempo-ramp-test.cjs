/* Run: node tests/song-tempo-ramp-test.cjs */
'use strict';
const assert=require('node:assert/strict');
require('../song-tempo-ramp.js');
const tempo=globalThis.RENAX_SONG_TEMPO;
const near=(a,b,tolerance=1e-9)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);

const fixed={count:3,measure:{tempo:120,numerator:6,denominator:8}};
near(tempo.duration(fixed),4.5);
near(tempo.stepDuration(fixed,0,0,0,1),.25);
near(tempo.duration({...fixed,tempoRamp:{enabled:false,endTempo:180}}),4.5);

for(const numerator of [3,4,6,11])
 for(const denominator of [4,8,16])
  for(const count of [1,2,8])
   for(const [start,end] of [[2,3],[120,121],[120,180],[998,999]]){
    const section={count,measure:{tempo:start,numerator,denominator},tempoRamp:{enabled:true,endTempo:end}};
    assert.equal(tempo.active(section),true);
    near(tempo.tempoAt(section,0),start);
    near(tempo.tempoAt(section,count*numerator),end);
    assert.ok(tempo.duration(section)<count*numerator*(240/denominator)/start);
    let steps=0,bars=0;
    for(let bar=0;bar<count;bar++){
      let barSteps=0;
      for(let beat=0;beat<numerator;beat++)
        for(let sub=0;sub<4;sub++)barSteps+=tempo.stepDuration(section,bar,beat,sub,4);
      near(barSteps,tempo.barDuration(section,bar));
      bars+=barSteps;
      steps+=barSteps;
    }
    near(steps,tempo.duration(section));
    near(bars,tempo.spanDuration(section,0,count*numerator));
 }
const invalid={count:2,measure:{tempo:140,numerator:4,denominator:4},tempoRamp:{enabled:true,endTempo:120}};
assert.equal(tempo.active(invalid),false);

// The approved Training shapes and SVG paths are the independent reference.
const fs=require('node:fs'),vm=require('node:vm');
const training=fs.readFileSync(require.resolve('../training-modes.js'),'utf8');
const referenceProfiles=vm.runInNewContext('['+training.split('const profiles=[')[1].split('\n  ];')[0]+']');
const referenceLevel=vm.runInNewContext('(function(key,p){'+training.split('function curveLevel(key,p){')[1].split('\n  }')[0]+'})');
assert.equal(JSON.stringify(tempo.profiles),JSON.stringify(referenceProfiles));
for(const [key] of referenceProfiles){
 for(let i=0;i<=100;i++)near(tempo.curveLevel(key,i/100),referenceLevel(key,i/100),0);
 const down=key.includes('down')&&!key.includes('up-down');
 for(const count of [1,4,5])for(const [numerator,denominator] of [[3,8],[4,4],[7,8]])for(const [low,high] of [[2,999],[120,180],[998,999]]){
  const start=down?high:low,end=down?low:high,total=count*numerator;
  const section={count,measure:{tempo:start,numerator,denominator},tempoRamp:{enabled:true,endTempo:end,curve:key}};
  assert(tempo.active(section),key);
  near(tempo.tempoAt(section,0),start);
  const returning=/-(up-down|down-up)$/.test(key);
  near(tempo.tempoAt(section,total),returning?start:end);
  if(returning){near(tempo.tempoAt(section,total/2),end);near(tempo.spanDuration(section,0,total/2),tempo.spanDuration(section,total/2,total/2),1e-8);}
  let duration=0;
  for(let bar=0;bar<count;bar++){
   let steps=0;
   for(let beat=0;beat<numerator;beat++)for(let sub=0;sub<4;sub++){
    const seconds=tempo.stepDuration(section,bar,beat,sub,4);assert(seconds>0&&Number.isFinite(seconds));steps+=seconds;
   }
   near(steps,tempo.barDuration(section,bar),1e-8);duration+=steps;
  }
  near(duration,tempo.duration(section),1e-8);
  assert.equal(tempo.active({...section,continuous:true}),false);
  near(tempo.duration({...section,continuous:true}),total*240/denominator/start);
 }
 // Fixed-grid composite Simpson is independent of the adaptive runtime integrator.
 const n=262144,low=2,high=999;
 let sum=0;
 for(let i=0;i<=n;i++)sum+=(i===0||i===n?1:i%2?4:2)/(low+(high-low)*referenceLevel(key,i/n));
 const section={count:5,measure:{tempo:down?high:low,numerator:7,denominator:8},tempoRamp:{enabled:true,endTempo:down?low:high,curve:key}};
 near(tempo.duration(section),sum/n/3*35*30,2e-7);
}
for(const ramp of [{enabled:true,endTempo:100,curve:'unknown'},{enabled:true,endTempo:120,curve:'linear-down'},{enabled:true,endTempo:1,curve:'linear-down'},{enabled:true,endTempo:1000,curve:'linear-up'}])assert.equal(tempo.active({...fixed,tempoRamp:ramp}),false);
console.log('Tempo ramp calculations: all checks passed.');
