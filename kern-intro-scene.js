/* Approved KERN renderer; classic script, private state, no audio scheduling. */
(()=>{const intro={};
/* RENAX motion studies. Preserved introductions, shared fade-through-black.
 * No audio engine edits. 24 independently directed elements × 5 actions.
 * Transition: fade presentation out, hold black, fade real interface in.
 */
(function(scope){
const DURATION=11.5, TRANSITION=9.5, BLACK=10.3, FADE_IN=10.5;
const waveBasis=Array.from({length:121},(_,i)=>{const u=i/120;return{u,env:.28+.72*Math.sin(u*Math.PI),sa:Math.sin(u*7.1),ca:Math.cos(u*7.1),sb:Math.sin(u*17),cb:Math.cos(u*17)}});
const palettes=[['#101316','#ff8a36','#c8d5d6'],['#e9e6db','#df481b','#283b37'],['#101bd0','#ff8a36','#c7eaff']];
function state(){return {time:0,turn:-.65,tilt:.26,pressure:0,light:0,title:0,spread:0,fade:{scene:1,app:0},parts:Array.from({length:24},(_,_i)=>({lift:0,angle:0,edge:0,lock:0,travel:0}))};}
const actions=[{name:'implantation',property:'lift',value:1,time:.1,duration:1.35,ease:'expo.out'}, {name:'extrusion',property:'travel',value:1,time:1.65,duration:1.5,ease:'power3.inOut'}, {name:'torsion',property:'angle',value:1,time:3.1,duration:1.65,ease:'power3.inOut'}, {name:'réflexion',property:'edge',value:1,time:4.7,duration:1.2,ease:'sine.inOut'}, {name:'verrouillage',property:'lock',value:1,time:6.65,duration:1.35,ease:'power4.out'}];
// Introduction and explicit transition storyboard share one seekable GSAP timeline.
function plan(_id=1){return {intro:actions.flatMap((a,j)=>Array.from({length:24},(_,i)=>({id:`A${String(j*24+i+1).padStart(3,'0')}`,element:i+1,action:a.name,property:a.property,target:a.value,start:a.time+Math.abs(i-11.5)*.045,duration:a.duration,ease:a.ease}))),transition:[{name:'Fondu au noir',start:TRANSITION,duration:.8},{name:'Noir complet',start:BLACK,duration:.2},{name:'Fondu entrant de l’interface',start:FADE_IN,duration:1}]};}
function timeline(g,s,id=0){const t=g.timeline({paused:true});t.to(s,{time:DURATION,duration:DURATION,ease:'none'},0);t.to(s,{light:1,duration:1.3,ease:'power3.out'},0).to(s,{turn:.34,tilt:-.13,duration:4.2,ease:'power2.inOut'},0).to(s,{turn:-.09,tilt:.04,duration:3.1,ease:'power3.inOut'},4.2).to(s,{title:1,duration:1.25,ease:'power3.out'},3.4);
const p=plan(id);p.intro.forEach(a=>t.to(s.parts[a.element-1],{[a.property]:a.target,duration:a.duration,ease:a.ease},a.start));t.to(s.fade,{scene:0,duration:.8,ease:'sine.inOut'},TRANSITION).to(s.fade,{app:1,duration:1,ease:'sine.inOut'},FADE_IN);t.addLabel('fondu au noir',TRANSITION).addLabel('noir complet',BLACK).addLabel('fondu entrant',FADE_IN).addLabel('interface',DURATION);return t;}
function draw(c,w,h,id,s,logo,options={}){const pal=palettes[id],cx=w*.5,cy=h*.40,unit=Math.min(w*.29,h*.30);if(!options.keepUnderlay)c.clearRect(0,0,w,h);if(!options.transparent){c.fillStyle=pal[0];c.fillRect(0,0,w,h);}
function pt(x,y,z){const a=s.turn,b=s.tilt;let X=x*Math.cos(a)+z*Math.sin(a),Z=-x*Math.sin(a)+z*Math.cos(a),Y=y*Math.cos(b)-Z*Math.sin(b);Z=y*Math.sin(b)+Z*Math.cos(b);const k=4.8/(4.8+Z);return[cx+X*unit*k,cy+Y*unit*k,Z];}
function line(a,b,color,width=1){c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(a[0],a[1]);c.lineTo(b[0],b[1]);c.stroke()}
function poly(ps,fill,stroke,width=.7){c.beginPath();ps.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1]));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}}
function solid(x,y,z,ww,hh,dd,angle,fill,edge){const co=Math.cos(angle),si=Math.sin(angle),v=[];for(let k=0;k<8;k++){let a=(k&1?1:-1)*ww/2,b=(k&2?1:-1)*hh/2,d=(k&4?1:-1)*dd/2;v.push(pt(x+a*co+d*si,y+b,z-a*si+d*co))}const faces=[[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]];faces.map((f,i)=>({ps:f.map(k=>v[k]),i,z:f.reduce((a,k)=>a+v[k][2],0)})).sort((a,b)=>b.z-a.z).forEach(f=>poly(f.ps,fill[f.i%fill.length],edge,.7));return v;}
// Dense, slow-moving ribbons are continuous surfaces, not particles.
if(id===0){if(!options.skipWaves){c.save();for(let batch=0;batch<15;batch++){c.beginPath();for(let j=batch;j<630;j+=15){if(j%135===0)continue;const phase=s.time*1.45+j*.005,sp=Math.sin(phase),cp=Math.cos(phase),sp2=Math.sin(phase*.66),cp2=Math.cos(phase*.66);for(let i=0;i<=120;i+=2){const b=waveBasis[i],x=b.u*w,y=h*.49+(b.sa*cp+b.ca*sp)*h*.23*b.env+(b.sb*cp2-b.cb*sp2)*h*.075+(j-314.5)*h*.0004;i?c.lineTo(x,y):c.moveTo(x,y)}}c.strokeStyle=batch%3===0?'#58b9c9':'#a2b5bd';c.globalAlpha=.012*s.light;c.lineWidth=.45;c.stroke()}c.beginPath();for(let j=0;j<630;j+=135){const phase=s.time*1.45+j*.005,sp=Math.sin(phase),cp=Math.cos(phase),sp2=Math.sin(phase*.66),cp2=Math.cos(phase*.66);for(let i=0;i<=120;i+=2){const b=waveBasis[i],x=b.u*w,y=h*.49+(b.sa*cp+b.ca*sp)*h*.23*b.env+(b.sb*cp2-b.cb*sp2)*h*.075+(j-314.5)*h*.0004;i?c.lineTo(x,y):c.moveTo(x,y)}}c.strokeStyle='#ff8a36';c.globalAlpha=.16*s.light;c.lineWidth=1;c.stroke();c.restore();}for(let k=0;k<24;k++){let p=s.parts[k],z=(k-11.5)*.068,sz=.86+p.travel*.18;let twist=(k-11.5)*.009*p.angle*(1-p.lock*.55);let a=sz*Math.cos(twist),b=sz*Math.sin(twist),yy=(1-p.lift)*1.3*(k%2?1:-1);const ps=[[-a+b,-a-b+yy,z],[a+b,-a+b+yy,z],[a-b,a+b+yy,z],[-a-b,a-b+yy,z]].map(v=>pt(...v));c.globalAlpha=s.light*(.14+.45*p.lift);poly(ps,k%6===0?'#11181b88':null,k%6===0?pal[1]:'#b3ced3');if(p.edge>.01){c.globalAlpha=p.edge*.7;line(ps[k%4],ps[(k+1)%4],k%3===0?pal[1]:'#8ee8f3',1.2)}c.globalAlpha=1;}}
if(id===1){ // Museum-like plinth, machined lamellae and individual edge lighting.
let glow=c.createRadialGradient(cx,cy,0,cx,cy,unit*2);glow.addColorStop(0,'#fffdf0');glow.addColorStop(1,'#e9e6db');c.fillStyle=glow;c.fillRect(0,0,w,h);
c.globalAlpha=.12;for(let k=-10;k<=10;k++)line(pt(-2,1.25,k*.18),pt(2,1.25,k*.18),'#536258',.6);c.globalAlpha=1;
let order=Array.from({length:24},(_,i)=>i).sort((a,b)=>Math.abs(b-11.5)-Math.abs(a-11.5));order.forEach(k=>{let p=s.parts[k],side=k<12?-1:1,dist=Math.abs(k-11.5);let x=side*(.67+dist*.065),y=(1-p.lift)*2.4*(k%2?1:-1),z=.5-dist*.115-p.travel*.16;let angle=side*(.6+p.angle*.45-p.lock*.36),hh=1.15+dist*.055;let fills=k%4===0?['#183a34','#31564b','#0f2925']:['#d3d3c2','#fbf8e9','#a7b1a0'];let v=solid(x,y,z,.035,hh,.55,angle,fills,k%4===0?'#426c59':'#adb5a1');if(p.edge>0){c.globalAlpha=p.edge*(.4+.3*Math.sin(s.time*1.7+k*.23)**2);line(v[5],v[7],k%4===0?'#f47839':'#fffef0',1.7);c.globalAlpha=1;} // etched identification, located on each solid rather than screen noise
if(p.lock>.1){c.globalAlpha=p.lock*.5;line(v[0],v[1],'#3f5948',1);c.globalAlpha=1;}});
// Contrast bridge behind typography: the title never crosses a busy face.
const base=c.createLinearGradient(0,h*.65,0,h*.9);base.addColorStop(0,'#e9e6db00');base.addColorStop(.45,'#e9e6dbf5');base.addColorStop(1,'#e9e6db');c.fillStyle=base;c.fillRect(0,h*.65,w,h*.28);
}
if(id===2){let faces=[],n=14;function node(i,j){let p=s.parts[(i+j)%24];let x=(i/n-.5)*3.7,y=(j/n-.5)*2.6+(1-p.lift)*Math.sin(i*.5)*.5,z=Math.sin(i*.65+s.time*1.6)*Math.cos(j*.53-s.time*.8)*(.18+p.travel*.19)*(1-p.lock*.2);z+=Math.sin((i+j)*.28)*p.angle*.12;return pt(x,y,z)}for(let i=0;i<n;i++)for(let j=0;j<n;j++){let a=node(i,j),b=node(i+1,j),d=node(i,j+1),e=node(i+1,j+1);faces.push({v:[a,b,d],i,j},{v:[b,e,d],i:i+1,j})}faces.sort((a,b)=>b.v.reduce((v,p)=>v+p[2],0)-a.v.reduce((v,p)=>v+p[2],0)).forEach((f,k)=>{let lum=.4+.4*Math.sin(f.i*.5+f.j*.4+s.time)**2;c.globalAlpha=s.light*lum;poly(f.v,k%29===0?'#b1d9ff':'#1624c3',s.parts[(f.i+f.j)%24].edge>.5?'#bee6ff':'#699cdb',.45+s.parts[(f.i+f.j)%24].edge*.3)});c.globalAlpha=1;}
// Exact approved SVG on extruded planes. Its geometry is never redrawn or morphed.
if(logo&&s.light){let scale=id===1?1.85:1.35;for(let k=12;k>=0;k--){let z=k*.014;let a=pt(-.31*scale,-.45*scale,z),b=pt(.31*scale,-.45*scale,z),d=pt(-.31*scale,.32*scale,z);c.save();c.globalAlpha=s.light*(k===0?1:.11);c.transform((b[0]-a[0])/772,(b[1]-a[1])/772,(d[0]-a[0])/958,(d[1]-a[1])/958,a[0],a[1]);c.drawImage(logo,0,0,772,958);c.restore()}}
// Typography is separated from scene geometry and lands on a controlled contrast field.
c.textAlign='center';let titleY=h*.79+(1-s.title)*h*.035;const fs=Math.min(w*.075,70);c.globalAlpha=s.title;c.font=`800 ${fs}px Montserrat, sans-serif`;if(id===1){c.fillStyle='#153a32';c.fillText('MÉTRO',cx-c.measureText('NOME').width/2,titleY);c.fillStyle='#ff7900';c.fillText('NOME',cx+c.measureText('MÉTRO').width/2,titleY)}else if(id===0){c.fillStyle='#ffffff';c.fillText('MÉTRO',cx-c.measureText('NOME').width/2,titleY);c.fillStyle='#ff7900';c.fillText('NOME',cx+c.measureText('MÉTRO').width/2,titleY)}else{c.fillStyle='#f3f1e8';c.fillText('MÉTRONOME',cx,titleY)}c.font=`600 ${Math.min(w*.023,18)}px Montserrat, sans-serif`;c.fillStyle=id===0?'#ffffff':id===1?'#344c3c':pal[1];c.fillText('R E N A X  D R U M S',cx,h*.85);c.globalAlpha=.55*s.light;c.font=`${Math.max(8,Math.min(11,w*.013))}px monospace`;c.fillStyle=pal[2];c.textAlign='left';c.fillText('',24,28);c.textAlign='right';c.fillText('David Arens',w-24,28);
// Fixed registration hairlines anchor the composition; restrained, no strobe.
c.globalAlpha=.35*s.light;line([24,h-25],[w*.17,h-25],pal[1],1);line([w*.83,h-25],[w-24,h-25],pal[1],1);c.globalAlpha=1;
}
scope.RenaxMotion={state,timeline,draw,plan,DURATION,TRANSITION,BLACK,FADE_IN};if(typeof module!=='undefined')module.exports=scope.RenaxMotion;
})(intro);

/* KERN background only. Transition uses ordinary opacity and needs no WebGL. */
(function(scope){
const WAVE_VERTEX=`
precision highp float;
attribute vec2 aWave;
uniform float uTime;
uniform float uLight;
varying vec4 vColor;
void main(){
 float u=aWave.x,j=aWave.y,phase=uTime*1.45+j*.005;
 float env=.28+.72*sin(u*3.141593);
 float y=.49+sin(u*7.1+phase)*.23*env+sin(u*17.-phase*.66)*.075+(j-314.5)*.0004;
 bool copper=mod(j,135.)<.5;bool cyan=mod(j,3.)<.5;
 vec3 color=copper?vec3(1.,.541,.212):cyan?vec3(.345,.725,.788):vec3(.635,.71,.741);
 vColor=vec4(color,(copper?.16:.009)*uLight);
 gl_Position=vec4(u*2.-1.,1.-y*2.,0.,1.);
}`;
const WAVE_FRAGMENT=`precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`;

class Waves {
 constructor(canvas){this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});if(!this.gl)throw Error('Wave GPU unavailable');this.canvas=canvas;this.resources=[];const g=this.gl;try{
 const shader=(type,source)=>{const s=g.createShader(type);this.resources.push(['shader',s]);g.shaderSource(s,source);g.compileShader(s);if(!g.getShaderParameter(s,g.COMPILE_STATUS))throw Error(g.getShaderInfoLog(s));return s};
 this.program=g.createProgram();this.resources.push(['program',this.program]);g.attachShader(this.program,shader(g.VERTEX_SHADER,WAVE_VERTEX));g.attachShader(this.program,shader(g.FRAGMENT_SHADER,WAVE_FRAGMENT));g.linkProgram(this.program);if(!g.getProgramParameter(this.program,g.LINK_STATUS))throw Error(g.getProgramInfoLog(this.program));g.useProgram(this.program);this.time=g.getUniformLocation(this.program,'uTime');this.light=g.getUniformLocation(this.program,'uLight');
 const v=[],ix=[];for(let j=0;j<630;j++)for(let i=0;i<=60;i++){v.push(i/60,j);if(i<60)ix.push(j*61+i,j*61+i+1)}this.count=ix.length;this.buffer=g.createBuffer();this.index=g.createBuffer();this.resources.push(['buffer',this.buffer],['buffer',this.index]);g.bindBuffer(g.ARRAY_BUFFER,this.buffer);g.bufferData(g.ARRAY_BUFFER,new Float32Array(v),g.STATIC_DRAW);const loc=g.getAttribLocation(this.program,'aWave');g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,2,g.FLOAT,false,0,0);g.bindBuffer(g.ELEMENT_ARRAY_BUFFER,this.index);g.bufferData(g.ELEMENT_ARRAY_BUFFER,new Uint16Array(ix),g.STATIC_DRAW);g.enable(g.BLEND);g.blendFuncSeparate(g.SRC_ALPHA,g.ONE_MINUS_SRC_ALPHA,g.ONE,g.ONE_MINUS_SRC_ALPHA);
 }catch(error){this.destroy();throw error}}
 render(time,light){const g=this.gl;g.viewport(0,0,this.canvas.width,this.canvas.height);g.clearColor(16/255,19/255,22/255,1);g.clear(g.COLOR_BUFFER_BIT);g.useProgram(this.program);g.uniform1f(this.time,time);g.uniform1f(this.light,light);g.drawElements(g.LINES,this.count,g.UNSIGNED_SHORT,0)}
 destroy(){const g=this.gl;for(const [type,r]of this.resources){if(type==='program')g.deleteProgram(r);else if(type==='shader')g.deleteShader(r);else g.deleteBuffer(r)}this.resources=[];g.clearColor(0,0,0,0);g.clear(g.COLOR_BUFFER_BIT)}
}
scope.RenaxWaves=Waves;
})(intro);

window.RENAX_KERN={...intro.RenaxMotion,RenaxWaves:intro.RenaxWaves};})();
