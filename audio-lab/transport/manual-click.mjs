/** Audio Lab manual click: same AudioContext clock as OriginalAudioPlayer. */
import { loadRenaxClickSamples } from './renax-click-presets.mjs';
import { scheduleWarpClickRange } from './warp-click.mjs';

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
    const unit=60/this.bpm*4/this.denominator;
    const bar=unit*this.numerator;
    const origin=p.startedAt-p.startedOffset+this.downbeat;
    const begin=Math.max(0,Math.ceil((from-origin)/unit-1e-9));
    const end=Math.floor((to-origin)/unit-1e-9);
    const groupStarts=new Set([0]);
    let sum=0;for(const group of this.groups){sum+=group;groupStarts.add(sum);}
    const events=[];
    for(let i=begin;i<=end && events.length<256;i++){
      const pos=i%this.numerator;
      const when=origin+i*unit;
      const rawSourceSeconds=p.startedOffset+(when-p.startedAt);
      const loop=p.loop;
      const sourceSeconds=loop && rawSourceSeconds>=loop.end
        ? loop.start+((rawSourceSeconds-loop.start)%(loop.end-loop.start))
        : rawSourceSeconds;
      if(sourceSeconds>=p.buffer.duration || sourceSeconds<0)continue;
      // Accent follows the looped source timeline, not the ever-increasing clock.
      const beatIndex=Math.round((sourceSeconds-this.downbeat)/unit);
      if(Math.abs(sourceSeconds-(this.downbeat+beatIndex*unit))>0.008)continue;
      const beatPosition=((beatIndex%this.numerator)+this.numerator)%this.numerator;
      events.push({seconds:when,accent:beatPosition===0?2:groupStarts.has(beatPosition)?1:0});
    }
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
