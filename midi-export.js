/* Standard MIDI file export, independent of the live audio engine. */
(() => {
  'use strict';
  const PPQ=960;
  const bytes=text=>Array.from(new TextEncoder().encode(text));
  const u32=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255];
  function variable(n){if(!Number.isSafeInteger(n)||n<0||n>0xfffffff)throw Error('Intervalle MIDI trop long.');const out=[n&127];while((n=Math.floor(n/128)))out.unshift((n&127)|128);return out;}
  function exportSong(song){
    RENAX_SONGS.validateLibrary({version:1,profiles:[{id:'midi',name:'Export',songs:[song]}]});
    const sections=RENAX_SONGS.playbackSections(song);
    let estimatedNotes=0,estimatedTempoEvents=0,estimatedTicks=0;
    for(const section of sections){
      const m=section.measure;
      estimatedNotes+=section.count*m.beatStates.reduce((total,states)=>total+states.filter(Boolean).length,0);
      if(RENAX_SONG_TEMPO.active(section))estimatedTempoEvents+=section.count*m.beatSubdivisions.reduce((total,n)=>total+n,0);
      estimatedTicks+=section.count*m.numerator*PPQ*4/m.denominator;
      if(estimatedNotes>1000000||estimatedTempoEvents>1000000||!Number.isSafeInteger(estimatedTicks))throw Error('Morceau trop long pour cet export MIDI.');
    }
    const events=[];let tick=0,notes=0;
    const meta=(at,type,data)=>events.push({at,order:0,data:[255,type,...variable(data.length),...data]});
    meta(0,3,bytes(song.name));
    for(const section of sections){const m=section.measure;
      meta(tick,6,bytes(section.label));
      const tempo=Math.round(60000000/m.tempo);
      if(tempo>0xffffff||tempo<1)throw Error('Tempo trop lent pour cet export MIDI. Le morceau est conservé ; choisissez un tempo d’au moins 4 BPM pour cet export.');
      meta(tick,0x51,[tempo>>>16&255,tempo>>>8&255,tempo&255]);
      meta(tick,0x58,[m.numerator,Math.log2(m.denominator),24,8]);
      const beatTicks=PPQ*4/m.denominator,sectionStart=tick;
      if(!RENAX_SONG_TEMPO.active(section)&&m.beatStates.every(states=>states.every(state=>state===0))){tick=Math.round(sectionStart+section.count*m.numerator*beatTicks);continue;}
      for(let bar=0;bar<section.count;bar++)for(let beat=0;beat<m.numerator;beat++){
        const count=m.beatSubdivisions[beat];
        for(let sub=0;sub<count;sub++){
          const at=Math.round(sectionStart+(bar*m.numerator+beat+sub/count)*beatTicks);
          if(RENAX_SONG_TEMPO.active(section)){
            const stepSeconds=RENAX_SONG_TEMPO.stepDuration(section,bar,beat,sub,count);
            const microTempo=Math.round(stepSeconds*1000000/(4/m.denominator/count));
            if(microTempo>0xffffff||microTempo<1)throw Error('Tempo trop lent pour cet export MIDI.');
            meta(at,0x51,[microTempo>>>16&255,microTempo>>>8&255,microTempo&255]);
          }
          const state=m.beatStates[beat][sub];if(!state)continue;
          if(++notes>1000000)throw Error('Morceau trop long pour cet export MIDI.');
          const end=Math.min(Math.round(sectionStart+(bar*m.numerator+beat+(sub+1)/count)*beatTicks),at+Math.max(1,Math.min(60,Math.round(beatTicks/count/2))));
          const velocity=[0,64,96,127][state];
          events.push({at,order:2,data:[0x99,37,velocity]},{at:end,order:1,data:[0x89,37,0]});
        }
      }
      tick=Math.round(sectionStart+section.count*m.numerator*beatTicks);
    }
    events.sort((a,b)=>a.at-b.at||a.order-b.order);
    const track=[];let last=0;
    for(const event of events){track.push(...variable(event.at-last),...event.data);last=event.at;}
    track.push(...variable(tick-last),255,0x2f,0);
    const data=new Uint8Array([...bytes('MThd'),0,0,0,6,0,0,0,1,PPQ>>>8,PPQ&255,...bytes('MTrk'),...u32(track.length),...track]);
    return {blob:new Blob([data],{type:'audio/midi'}),report:{ticks:tick,ppq:PPQ,notes}};
  }
  window.RENAX_MIDI_EXPORT={exportSong};
})();
