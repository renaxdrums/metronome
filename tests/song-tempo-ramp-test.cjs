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
console.log('Tempo ramp calculations: all checks passed.');
