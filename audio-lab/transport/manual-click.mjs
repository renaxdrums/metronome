/** Audio Lab manual click: same AudioContext clock as OriginalAudioPlayer. */
import { loadRenaxClickSamples } from './renax-click-presets.mjs';
import { scheduleWarpClickRange } from './warp-click.mjs';

/** Map a short AudioContext scheduling window through the source A/B loop.
 * The click follows source beats again after every wrap, even for free loops
 * whose duration is not a whole number of beats.
 */
export function planManualClickEvents({player,fromSeconds,toSeconds,bpm,downbeat,numerator,
  denominator,groups,maxEvents=256}) {
  if (!player || !Number.isFinite(fromSeconds) || !Number.isFinite(toSeconds) ||
      toSeconds < fromSeconds || !Number.isFinite(player.startedAt) ||
      !Number.isFinite(player.startedOffset)) throw new RangeError('Invalid click window');
  const unit=60/bpm*4/denominator;
  const groupStarts=new Set([0]);
  let sum=0;for(const group of groups){sum+=group;groupStarts.add(sum);}
  const events=[];
  let cursor=Math.max(fromSeconds,player.startedAt);
  while(cursor<toSeconds && events.length<maxEvents){
    const elapsed=cursor-player.startedAt;
    const rawSource=player.startedOffset+elapsed;
    const loop=player.loop;
    const sourceSeconds=loop && rawSource>=loop.end
      ? loop.start+(rawSource-loop.end)%(loop.end-loop.start)
      : rawSource;
    const remaining=(loop ? loop.end : player.buffer.duration)-sourceSeconds;
    if(remaining<=0)break;
    const segmentEnd=Math.min(toSeconds,cursor+remaining);
    const sourceEnd=sourceSeconds+(segmentEnd-cursor);
    const firstBeat=Math.max(0,Math.ceil((sourceSeconds-downbeat)/unit-1e-9));
    for(let i=firstBeat;events.length<maxEvents;i++){
      const beatSource=downbeat+i*unit;
      if(beatSource>=sourceEnd-1e-9)break;
      if(beatSource<sourceSeconds-1e-9)continue;
      const beatPosition=i%numerator;
      events.push({seconds:cursor+beatSource-sourceSeconds,
        accent:beatPosition===0?2:groupStarts.has(beatPosition)?1:0});
    }
    cursor=segmentEnd;
  }
  return events;
}

export class ManualClick {
  constructor(player) {
    this.player = player;
    this.context = player.context;
    this.samples = null;
    this.enabled = false;
    this.bpm = 120;
    this.downbeat = 0;
    this.numerator = 4;
    this.denominator = 4;
    this.groups = [4];
    this.volume = 0.7;
    this.nodes = [];
    this.timer = null;
    this.through = 0;
    this.generation = 0;
    this.bus = this.context.createGain();
    this.bus.gain.value = this.volume;
    this.bus.connect(this.context.destination);
  }
  async enable() {
    const generation = ++this.generation;
    if (!this.samples) {
      const samples = await loadRenaxClickSamples(this.context);
      if (generation !== this.generation) return;
      this.samples = samples;
    }
    this.enabled = true;
    this.sync();
  }
  disable() { this.generation++; this.enabled = false; this.sync(); }
  configure({bpm=this.bpm,downbeat=this.downbeat,numerator=this.numerator,denominator=this.denominator,groups=this.groups}={}) {
    if (![bpm,downbeat,numerator,denominator].every(Number.isFinite) || bpm < 1 || bpm > 500 ||
        downbeat < 0 || !Number.isInteger(numerator) || numerator < 1 ||
        ![2,4,8,16,32].includes(denominator) || !Array.isArray(groups) ||
        groups.some(g=>!Number.isInteger(g)||g<1) || groups.reduce((a,b)=>a+b,0)!==numerator)
      throw new RangeError('Invalid manual click configuration');
    Object.assign(this,{bpm,downbeat,numerator,denominator,groups:[...groups]});
    this.sync();
  }
  setVolume(value) {
    if (!Number.isFinite(value)||value<0||value>1) throw new RangeError('Invalid click volume');
    this.volume=value;
    this.bus.gain.setTargetAtTime(value,this.context.currentTime,0.005);
  }
  clear() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer=null;
    for (const node of this.nodes) { try {node.stop();}catch{} try{node.disconnect();}catch{} }
    this.nodes=[];
  }
  sync() {
    this.clear();
    if (!this.enabled || !this.samples || !this.player.playing) return;
    this.through = Math.max(this.context.currentTime,this.player.startedAt);
    this.schedule();
    this.timer=setInterval(()=>this.schedule(),35);
  }
  schedule() {
    if (!this.player.playing || !this.enabled) {this.clear();return;}
    const context=this.context, p=this.player;
    const from=Math.max(this.through,context.currentTime);
    const to=context.currentTime+0.20;
    if (to<=from) return;
    const events=planManualClickEvents({player:p,fromSeconds:from,toSeconds:to,
      bpm:this.bpm,downbeat:this.downbeat,numerator:this.numerator,
      denominator:this.denominator,groups:this.groups});
    if(events.length){
      const nodes=scheduleWarpClickRange({
        context,clickSamples:this.samples,destination:this.bus,
        plan:{events},sessionStartAudioTime:0,
        fromSeconds:Math.max(0,from),toSeconds:to,gain:1
      });
      for(const node of nodes){
        const previous=node.onended;
        node.onended=()=>{previous?.();this.nodes=this.nodes.filter(n=>n!==node);};
      }
      this.nodes.push(...nodes);
    }
    this.through=to;
  }
  dispose(){this.disable();this.bus.disconnect();}
}
