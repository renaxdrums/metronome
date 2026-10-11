/* Training controls and tempo trajectories; the audio scheduler remains shared. */
(() => {
  const section=document.querySelector('.training-section');
  const svg=path=>'<svg viewBox="0 0 32 24" aria-hidden="true" focusable="false"><path d="M3 2v19h27" class="curve-axis"/><path d="'+path+'"/></svg>';
  const icons={linearUp:'M6 18 28 4',linearDown:'M6 4 28 18',up:'M6 18C18 18 24 14 28 4',down:'M6 4C10 14 16 18 28 18',steps:'M6 18h7v-5h7V8h8V3'};
  let mode='progressive',curve='linear-up';
  const profiles=[
    ['linear-up','Montée linéaire','M6 18L28 4'],
    ['linear-down','Descente linéaire','M6 4L28 18'],
    ['linear-up-down','Montée puis descente linéaire','M6 18L17 4L28 18'],
    ['linear-down-up','Descente puis montée linéaire','M6 4L17 18L28 4'],
    ['round-up','Montée arrondie','M6 18Q17 4 28 4'],
    ['round-down','Descente arrondie','M6 4Q17 4 28 18'],
    ['round-up-down','Montée puis descente arrondie','M6 18Q17 -10 28 18'],
    ['round-down-up','Descente puis montée arrondie','M6 4Q17 32 28 4'],
    ['exponential-up','Montée exponentielle','M6 18C18 18 24 14 28 4'],
    ['exponential-down','Descente exponentielle','M6 4C10 14 16 18 28 18'],
    ['inverse-up','Montée exponentielle inverse','M6 18C8 7 16 4 28 4'],
    ['inverse-down','Descente exponentielle inverse','M6 4C18 4 26 7 28 18']
  ];
  const profile=()=>profiles.find(item=>item[0]===curve)||profiles[0];
  // The icon paths and tempo use the same normalized geometry.
  function curveLevel(key,p){
    p=Math.max(0,Math.min(1,p));
    if(key==='exponential-up')return Math.expm1(3*p)/Math.expm1(3);
    if(key==='exponential-down')return Math.expm1(3*(1-p))/Math.expm1(3);
    if(key==='inverse-up')return Math.log1p(Math.expm1(3)*p)/3;
    if(key==='inverse-down')return Math.log1p(Math.expm1(3)*(1-p))/3;
    if(key==='linear-up')return p;
    if(key==='linear-down')return 1-p;
    if(key==='linear-up-down')return 1-Math.abs(2*p-1);
    if(key==='linear-down-up')return Math.abs(2*p-1);
    if(key==='round-up')return 2*p-p*p;
    if(key==='round-down')return 1-p*p;
    if(key==='round-up-down')return 4*p*(1-p);
    if(key==='round-down-up')return (2*p-1)*(2*p-1);
    return p;
  }
  const tabs=document.createElement('div');tabs.className='training-mode-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label',"Type d’entraînement");
  const fields=document.createElement('div');fields.className='training-fields';fields.id='trainingFields';fields.setAttribute('role','tabpanel');
  const start=document.getElementById('trainStart'),end=document.getElementById('trainEnd'),duration=document.getElementById('trainDuration');
  const row=input=>input.closest('.training-row');
  const direction=document.getElementById('dirToggle').closest('.training-row');
  fields.append(row(start),direction,row(end),row(duration));
  start.setAttribute('aria-label','BPM de départ');end.setAttribute('aria-label',"BPM d’arrivée");duration.setAttribute('aria-label','Durée totale en minutes');
  const durationRow=row(duration);durationRow.classList.add('training-duration-row');durationRow.querySelector('.unit')?.remove();
  const durationUnit=document.createElement('select');durationUnit.id='trainDurationUnit';durationUnit.setAttribute('aria-label','Unité du temps d’entraînement');durationUnit.innerHTML='<option value="seconds">secondes</option><option value="minutes" selected>minutes</option>';durationRow.append(durationUnit);
  durationUnit.addEventListener('change',()=>{duration.max=durationUnit.value==='seconds'?'3600':'60';duration.setAttribute('aria-label','Durée totale en '+(durationUnit.value==='seconds'?'secondes':'minutes'));});
  const endLabel=row(end).querySelector('.row-label');endLabel.textContent='Arrivée';
  function makeRow(label,id,value,min,max){const wrapper=document.createElement('div');wrapper.className='training-row';const text=document.createElement('label');text.className='row-label';text.htmlFor=id;text.textContent=label;const input=document.createElement('input');input.type='number';input.id=id;input.inputMode='numeric';input.value=value;input.min=min;input.max=max;input.step=1;wrapper.append(text,input);fields.append(wrapper);return {wrapper,input};}
  const step=makeRow('Écart','trainStep',4,1,997);const stepUnit=document.createElement('span');stepUnit.className='unit';stepUnit.textContent='BPM';step.wrapper.append(stepUnit);
  const interval=makeRow('Toutes les','trainInterval',30,1,3600);const unit=document.createElement('select');unit.id='trainIntervalUnit';unit.setAttribute('aria-label','Unité de durée du palier');unit.innerHTML='<option value="seconds">secondes</option><option value="minutes">minutes</option>';interval.wrapper.append(unit);
  // The mobile keyboard Done action confirms editing without starting playback.
  for(const input of fields.querySelectorAll('input[type="number"]')){
    input.enterKeyHint='done';
    input.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing)return;
      event.preventDefault();event.stopPropagation();
      input.dispatchEvent(new Event('change',{bubbles:true}));
      input.blur();
    });
  }
  const curveRow=document.createElement('div');curveRow.className='training-curve-row';const curveLabel=document.createElement('span');curveLabel.textContent='Courbe';const curves=document.createElement('div');curves.className='training-curve-options';curves.setAttribute('role','group');curves.setAttribute('aria-label','Courbe du tempo');curveRow.append(curveLabel,curves);fields.append(curveRow);
  const curveStyle=document.createElement('style');curveStyle.textContent=`
    .training-section .training-curve-options{position:relative;display:block;width:100%;flex:1;min-width:0}
    .training-curve-select{position:relative;width:100%}
    .training-curve-select>summary{list-style:none;display:flex;align-items:center;gap:8px;background:var(--grey);border:1px solid var(--border);border-radius:4px;padding:6px 8px;cursor:pointer;font-size:10px;color:var(--text)}
    .training-curve-select>summary::-webkit-details-marker{display:none}
    .training-curve-select>summary::after{content:'▾';margin-left:auto}
    .training-curve-select svg{width:32px;height:24px;flex-shrink:0;fill:none;stroke:var(--cyan);stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .training-curve-select .curve-axis{stroke:var(--text-muted);stroke-width:1;opacity:.4}
    .training-curve-menu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;position:absolute;left:0;right:0;top:calc(100% + 4px);padding:6px;background:var(--panel);border:1px solid var(--border);border-radius:6px;z-index:100;box-shadow:0 6px 18px #0008}
    .training-curve-menu button{min-width:0;min-height:44px;display:flex;align-items:center;justify-content:center;background:var(--grey);border:1px solid var(--border);border-radius:4px;cursor:pointer}
    .training-curve-menu button[aria-pressed="true"]{border-color:var(--orange);background:var(--grey-hover)}
    .training-curve-select summary:focus-visible,.training-curve-menu button:focus-visible{outline:2px solid var(--orange);outline-offset:2px}
    .training-curve-select[aria-disabled="true"]>summary{opacity:.45;cursor:default}
  `;document.head.append(curveStyle);
  const selector=document.createElement('details');selector.className='training-curve-select';
  const summary=document.createElement('summary');summary.setAttribute('aria-label','Choisir la courbe du tempo');
  const menu=document.createElement('div');menu.className='training-curve-menu';menu.setAttribute('role','group');menu.setAttribute('aria-label','Courbes du tempo');
  selector.append(summary,menu);curves.append(selector);
  const curveButtons=[];
  for(const [value,label,path] of profiles){const button=document.createElement('button');button.type='button';button.dataset.curve=value;button.title=label;button.setAttribute('aria-label',label);button.innerHTML=svg(path);button.onclick=()=>{if(training.engaged)return;curve=value;update();selector.open=false;summary.focus();};menu.append(button);curveButtons.push(button);}
  summary.addEventListener('click',event=>{if(training.engaged)event.preventDefault();});
  selector.addEventListener('keydown',event=>{if(event.key==='Escape'){selector.open=false;summary.focus();event.stopPropagation();}});
  document.addEventListener('click',event=>{if(!selector.contains(event.target))selector.open=false;});
  const modeButtons=[];
  for(const [value,label,icon] of [['progressive','Progressif',icons.up],['steps','Par paliers',icons.steps]]){const button=document.createElement('button');button.type='button';button.id='trainingMode-'+value;button.setAttribute('role','tab');button.setAttribute('aria-controls',fields.id);button.dataset.trainingMode=value;button.innerHTML=svg(icon)+'<span>'+label+'</span>';button.onclick=()=>{mode=value;update();};button.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const target=event.key==='Home'?0:event.key==='End'?1:modeButtons.indexOf(button)===0?1:0;modeButtons[target].click();modeButtons[target].focus();}};tabs.append(button);modeButtons.push(button);}
  const runStatus=document.createElement('p');runStatus.id='trainingRunStatus';runStatus.setAttribute('role','status');runStatus.hidden=true;
  const oldLabel=section.querySelector(':scope > label');section.prepend(tabs,fields);if(oldLabel)section.prepend(oldLabel);section.append(runStatus);
  function update(){const stepped=mode==='steps';for(const button of modeButtons){const selected=button.dataset.trainingMode===mode;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;button.disabled=training.engaged;}
    if(!stepped&&!training.engaged){const a=Number(start.value),b=Number(end.value),down=curve.includes('down')&&!curve.includes('up-down');if(Number.isFinite(a)&&Number.isFinite(b)){start.value=down?Math.max(a,b):Math.min(a,b);end.value=down?Math.min(a,b):Math.max(a,b);}endLabel.textContent=curve.endsWith('up-down')?'Sommet':curve.endsWith('down-up')?'Minimum':'Arrivée';end.setAttribute('aria-label',endLabel.textContent+' en BPM');}
    fields.setAttribute('aria-labelledby','trainingMode-'+mode);row(end).hidden=stepped;row(duration).hidden=stepped;curveRow.hidden=stepped;step.wrapper.hidden=!stepped;interval.wrapper.hidden=!stepped;
    direction.hidden=!stepped;
    const selectedProfile=profile();summary.innerHTML=svg(selectedProfile[2])+'<span>'+selectedProfile[1]+'</span>';
    selector.setAttribute('aria-disabled',String(training.engaged));summary.tabIndex=training.engaged?-1:0;
    if(training.engaged)selector.open=false;
    for(const button of curveButtons){button.setAttribute('aria-pressed',String(button.dataset.curve===curve));button.disabled=training.engaged;}
    for(const element of fields.querySelectorAll('input,select,#dirToggle button'))element.disabled=training.engaged;
    fields.querySelectorAll('select').forEach(select=>{const custom=select.parentElement.querySelector('.numbox-button');if(custom)custom.disabled=select.disabled;});
  }
  document.getElementById('dirToggle').addEventListener('click',update);
  function prepare(a,b,dur,direction){
    const stepBpm=Math.max(1,Math.min(997,parseInt(step.input.value)||4));step.input.value=stepBpm;
    const max=unit.value==='minutes'?60:3600;const count=Math.max(1,Math.min(max,parseInt(interval.input.value)||1));interval.input.value=count;runStatus.hidden=true;
    const low=Math.min(a,b),high=Math.max(a,b),startsHigh=curve.includes('down')&&!curve.includes('up-down');
    return {mode,curve,direction,startBpm:mode==='steps'?a:startsHigh?high:low,endBpm:mode==='steps'?(direction==='up'?999:2):startsHigh?low:high,lowBpm:low,highBpm:high,duration:dur*(durationUnit.value==='seconds'?1000:60000),stepBpm,stepMs:count*(unit.value==='minutes'?60000:1000)};
  }
  function at(run,elapsed){
    if(run.mode==='steps'){const n=Math.floor(Math.max(0,elapsed)/run.stepMs);const raw=run.startBpm+(run.direction==='up'?1:-1)*run.stepBpm*n;const bpm=Math.max(2,Math.min(999,raw));return {bpm,done:run.direction==='up'?raw>=999:raw<=2};}
    const p=Math.max(0,Math.min(1,elapsed/run.duration));
    return {bpm:Math.round(run.lowBpm+(run.highBpm-run.lowBpm)*curveLevel(run.curve,p)),done:p>=1};
  }
  function finish(bpm){runStatus.textContent=mode==='steps'?'Limite de '+bpm+' BPM atteinte — entraînement arrêté.':'Entraînement terminé.';runStatus.hidden=false;}
  window.RENAX_TRAINING={get mode(){return mode;},get editState(){return {mode,curve};},restoreEditState(state){if(state){mode=state.mode==='steps'?'steps':'progressive';curve=profiles.some(p=>p[0]===state.curve)?state.curve:'linear-up';}duration.max=durationUnit.value==='seconds'?'3600':'60';update();},prepare,at,update,finish,begin(){runStatus.hidden=true;}};update();
})();

