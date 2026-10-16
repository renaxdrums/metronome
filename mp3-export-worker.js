/* Export only: whole-program gain, safety limiter, true-peak analysis and LAME. */
importScripts('vendor/lamejs/lame.min.js');
const CEILING = Math.pow(10, -1.15 / 20);
// Eight-phase, 32-tap windowed-sinc reconstruction. Original samples are also
// measured; the extra 0.15 dB margin protects the -1 dBTP export ceiling.
const phases = Array.from({length:7}, (_, p) => {
  const f=(p+1)/8, c=[];let sum=0;
  for(let k=-15;k<=16;k++) {
    const x=k-f, sinc=Math.sin(Math.PI*x)/(Math.PI*x);
    const w=0.42+0.5*Math.cos(Math.PI*x/16)+0.08*Math.cos(2*Math.PI*x/16);
    const v=sinc*w;c.push(v);sum+=v;
  }
  return c.map(v=>v/sum);
});
function truePeak(a) {
  let peak=0;
  for(let i=0;i<a.length;i++)peak=Math.max(peak,Math.abs(a[i]));
  for(let i=-1;i<a.length;i++)for(const c of phases){
    let v=0;
    for(let j=0;j<32;j++){const n=i+j-15;if(n>=0&&n<a.length)v+=a[n]*c[j];}
    peak=Math.max(peak,Math.abs(v));
  }
  return peak;
}
function limit(a, rate, ceiling=CEILING, reinforced=false) {
  const look=Math.ceil(rate*(reinforced ? .001 : .005)), release=Math.exp(-1/(rate*(reinforced ? .005 : .05)));
  const deque=new Int32Array(a.length), out=new Float32Array(a.length);
  let head=0,tail=0,gain=1,minGain=1;
  for(let i=0;i<a.length+look;i++) {
    if(i<a.length){while(tail>head&&Math.abs(a[deque[tail-1]])<=Math.abs(a[i]))tail--;deque[tail++]=i;}
    const n=i-look;if(n<0)continue;
    while(tail>head&&deque[head]<n)head++;
    const peak=tail>head?Math.abs(a[deque[head]]):0;
    const required=peak>ceiling?ceiling/peak:1;
    gain=required<gain?required:Math.min(required,1-(1-gain)*release);
    minGain=Math.min(minGain,gain);out[n]=a[n]*gain;
  }
  return {pcm:out,minGain};
}
function encode(pcm,rate) {
  const encoder=new lamejs.Mp3Encoder(1,rate,320),chunks=[];
  let size=0;
  for(let i=0;i<pcm.length;i+=1152){
    const samples=new Int16Array(Math.min(1152,pcm.length-i));
    for(let j=0;j<samples.length;j++)samples[j]=Math.round(Math.max(-1,Math.min(1,pcm[i+j]))*32767);
    const data=encoder.encodeBuffer(samples);if(data.length){chunks.push(new Uint8Array(data));size+=data.length;}
  }
  const end=encoder.flush();chunks.push(new Uint8Array(end));size+=end.length;
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}
let rendered=null,rate=48000,report=null;
self.onmessage=({data})=>{
  try {
    if(data.op==='peak') {self.postMessage({peak:truePeak(data.pcm)});return;}
    if(data.op==='limiterTest'){const result=limit(data.pcm,data.rate,data.ceiling);self.postMessage(result,[result.pcm.buffer]);return;}
    if(data.op==='prepare') {
      rate=data.rate;const input=data.pcm,peak=truePeak(input);
      // A bounded lift; shorter recovery keeps subsequent soft clicks from ducking.
      const boostDb=data.level==='boost'?2:0;
      const gain=peak>0?CEILING/peak*Math.pow(10,boostDb/20):1;
      for(let i=0;i<input.length;i++)input[i]*=gain;
      const limited=limit(input,rate,CEILING,data.level==='boost');rendered=limited.pcm;
      const limitedPeak=truePeak(rendered);
      if(limitedPeak>CEILING)for(let i=0;i<rendered.length;i++)rendered[i]*=CEILING/limitedPeak;
      report={level:data.level==='boost'?'boost':'original',boostDb,sourceTruePeak:peak,gainDb:20*Math.log10(gain),limiterMinGain:limited.minGain,preEncodingTruePeak:truePeak(rendered)};
    }
    if(!rendered)throw Error('Rendu audio absent.');
    const correction=data.correction||1;
    if(correction!==1){for(let i=0;i<rendered.length;i++)rendered[i]*=correction;report.gainDb+=20*Math.log10(correction);report.preEncodingTruePeak*=correction;}
    const bytes=encode(rendered,rate);self.postMessage({bytes,report},[bytes.buffer]);
  }catch(e){self.postMessage({error:e.message});}
};
